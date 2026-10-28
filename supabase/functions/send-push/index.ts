/**
 * send-push — sends real Web Push notifications (VAPID) to the devices registered in `push_subscriptions`.
 *
 *   POST { "campaign": "push-available", "platform"?: "android" | "ios" | "desktop" | "other" | "all",
 *          "limit"?: 1..500, "dryRun"?: boolean }
 *        Authorization: Bearer <PUSH_ADMIN_TOKEN>        (administrator: announcement to many devices)
 *   POST { "campaign": "test" }
 *        Authorization: Bearer <access token of the signed-in user>   (a test to the caller's own devices)
 *
 * Only the campaigns in ../_shared/campaigns.ts exist (texts in pt-PT / en / pl; each device gets the app
 * language of its account). A campaign reaches each device once (`push_deliveries`), so it can be re-run
 * until `hasMore` is false and again later for the devices that subscribed in the meantime.
 * Subscriptions the push service reports as gone (404/410) are deleted.
 *
 * Secrets (supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_ADMIN_TOKEN, VAPID_SUBJECT (optional).
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. verify_jwt is off (config.toml):
 * authentication is done here, so that PUSH_ADMIN_TOKEN works regardless of the project's API key format.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import {
  buildPayload,
  CAMPAIGNS,
  isCampaignId,
  isPushPlatform,
  type CampaignId,
  type PushPayload,
  type PushPlatform,
} from '../_shared/campaigns.ts'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 500
const CHUNK = 25
const TEST_COOLDOWN_MS = 30_000
const DEFAULT_SUBJECT = 'https://erasmus-help.pontodigital.eu'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Target {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  locale: string | null
}

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const bearer = (req: Request): string => {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')
  return match?.[1]?.trim() ?? ''
}

/** Constant-time string comparison (compares SHA-256 digests, so the length does not leak either). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const x = new Uint8Array(da)
  const y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(max, Math.max(min, n))
}

interface SendReport {
  sent: string[]
  gone: string[]
  failed: number
  failures: Record<string, number>
}

async function sendAll(targets: Target[], campaign: CampaignId): Promise<SendReport> {
  const report: SendReport = { sent: [], gone: [], failed: 0, failures: {} }
  const ttl = CAMPAIGNS[campaign].ttl
  const payloads = new Map<string, string>()
  const bodyFor = (locale: string | null): string => {
    const key = locale ?? ''
    let body = payloads.get(key)
    if (body === undefined) {
      const payload: PushPayload = buildPayload(campaign, locale)
      body = JSON.stringify(payload)
      payloads.set(key, body)
    }
    return body
  }

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map((t) =>
        webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, bodyFor(t.locale), {
          TTL: ttl,
          urgency: 'normal',
          topic: campaign,
        }),
      ),
    )
    results.forEach((result, index) => {
      const target = chunk[index]
      if (!target) return
      if (result.status === 'fulfilled') {
        report.sent.push(target.id)
        return
      }
      const status = (result.reason as { statusCode?: unknown } | null)?.statusCode
      if (status === 404 || status === 410) {
        report.gone.push(target.id)
        return
      }
      report.failed += 1
      const key = typeof status === 'number' ? String(status) : 'network'
      report.failures[key] = (report.failures[key] ?? 0) + 1
    })
  }
  return report
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { error: 'invalid_input' })
  }
  if (!isCampaignId(body.campaign)) return json(400, { error: 'unknown_campaign' })
  const campaign = body.campaign

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return json(503, { error: 'not_configured' })

  const token = bearer(req)
  if (!token) return json(401, { error: 'unauthorized' })
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || DEFAULT_SUBJECT, vapidPublic, vapidPrivate)
  } catch {
    return json(503, { error: 'not_configured' })
  }

  // --- A user testing their own devices ---------------------------------------------------------
  if (campaign === 'test') {
    const { data: auth, error: authError } = await db.auth.getUser(token)
    const uid = auth?.user?.id
    if (authError || !uid) return json(401, { error: 'unauthorized' })

    const { data: profile } = await db.from('profiles').select('app_language').eq('id', uid).maybeSingle()
    const cutoff = new Date(Date.now() - TEST_COOLDOWN_MS).toISOString()
    // Atomic throttle: only devices not tested in the last 30 s are claimed (and stamped) by this call.
    const { data: claimed, error } = await db
      .from('push_subscriptions')
      .update({ last_test_at: new Date().toISOString() })
      .eq('user_id', uid)
      .or(`last_test_at.is.null,last_test_at.lt.${cutoff}`)
      .select('id, endpoint, p256dh, auth, locale')
    if (error) return json(500, { error: 'unavailable' })
    if (!claimed || claimed.length === 0) {
      const { count } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      return count ? json(429, { error: 'rate_limited' }) : json(404, { error: 'no_subscription' })
    }

    const targets = claimed.map((row): Target => ({ ...row, locale: profile?.app_language ?? row.locale }))
    const report = await sendAll(targets, 'test')
    if (report.gone.length > 0) await db.from('push_subscriptions').delete().in('id', report.gone)
    return json(200, { campaign, sent: report.sent.length, removed: report.gone.length, failed: report.failed })
  }

  // --- Administrator announcement ---------------------------------------------------------------
  const adminToken = Deno.env.get('PUSH_ADMIN_TOKEN')
  if (!adminToken) return json(503, { error: 'not_configured' })
  if (!(await safeEqual(token, adminToken))) return json(401, { error: 'unauthorized' })

  let platform: PushPlatform | null
  if (body.platform === undefined) platform = CAMPAIGNS[campaign].defaultPlatform
  else if (body.platform === 'all') platform = null
  else if (isPushPlatform(body.platform)) platform = body.platform
  else return json(400, { error: 'invalid_input' })
  const limit = readInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)

  // One extra row tells whether more devices are waiting after this run.
  const { data: pending, error: pendingError } = await db.rpc('push_pending_subscriptions', {
    p_campaign: campaign,
    p_platform: platform,
    p_limit: limit + 1,
  })
  if (pendingError) return json(500, { error: 'unavailable' })
  const rows = (pending ?? []) as Target[]
  const hasMore = rows.length > limit
  const targets = rows.slice(0, limit)

  if (body.dryRun === true) return json(200, { campaign, platform: platform ?? 'all', dryRun: true, targeted: targets.length, hasMore })

  const report = await sendAll(targets, campaign)
  if (report.sent.length > 0) {
    const { error } = await db
      .from('push_deliveries')
      .upsert(report.sent.map((subscription_id) => ({ campaign, subscription_id })), { onConflict: 'campaign,subscription_id', ignoreDuplicates: true })
    if (error) return json(500, { error: 'unavailable', sent: report.sent.length })
  }
  if (report.gone.length > 0) await db.from('push_subscriptions').delete().in('id', report.gone)

  return json(200, {
    campaign,
    platform: platform ?? 'all',
    targeted: targets.length,
    sent: report.sent.length,
    removed: report.gone.length,
    failed: report.failed,
    failures: report.failures,
    hasMore,
  })
})
