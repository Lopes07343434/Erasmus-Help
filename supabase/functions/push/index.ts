/**
 * Edge Function `push` — Web Push for the Erasmus Help chat.
 *
 *   POST /subscribe    { subscription, locale? }   Authorization: Bearer <user access token>   → { ok: true }
 *   POST /unsubscribe  { endpoint }                Authorization: Bearer <user access token>   → { ok: true }
 *   POST /notify       { message_id }              x-push-secret: <PUSH_WEBHOOK_SECRET>        → { ok, sent }   (database trigger)
 *
 * Secrets (supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_WEBHOOK_SECRET,
 * optional ALLOWED_ORIGINS (comma separated). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
 * `verify_jwt = false` (supabase/config.toml): the function authenticates every route itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { buildNotification, isAllowedPushEndpoint, normalizeLocale, parseSubscription, safeEqual } from './payload.ts'

const MAX_SUBSCRIPTIONS_PER_USER = 5
const MAX_RECIPIENTS = 200
/** A retried/late webhook must not resurrect old messages. */
const MAX_MESSAGE_AGE_MS = 5 * 60_000
const MAX_BODY_BYTES = 8 * 1024

const env = (name: string): string => Deno.env.get(name) ?? ''
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const allowedOrigins = (env('ALLOWED_ORIGINS') || 'https://erasmus-help.pontodigital.eu,http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  const subject = env('VAPID_SUBJECT')
  const pub = env('VAPID_PUBLIC_KEY')
  const priv = env('VAPID_PRIVATE_KEY')
  if (!subject || !pub || !priv) return false
  webpush.setVapidDetails(subject, pub, priv)
  vapidReady = true
  return true
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  return {
    ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Max-Age': '86400',
  }
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function userIdOf(req: Request): Promise<string | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

async function subscribe(req: Request): Promise<Response> {
  const userId = await userIdOf(req)
  if (!userId) return json(req, 401, { error: 'unauthorized' })
  const body = await readBody(req)
  const subscription = body ? parseSubscription(body.subscription) : null
  if (!body || !subscription) return json(req, 400, { error: 'invalid_input' })

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      locale: normalizeLocale(body.locale),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) return json(req, 500, { error: 'unavailable' })

  // Keep only the newest devices of this account.
  const { data: rows } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  const stale = (rows ?? []).slice(MAX_SUBSCRIPTIONS_PER_USER).map((r) => r.id as string)
  if (stale.length > 0) await admin.from('push_subscriptions').delete().in('id', stale)
  return json(req, 200, { ok: true })
}

async function unsubscribe(req: Request): Promise<Response> {
  const userId = await userIdOf(req)
  if (!userId) return json(req, 401, { error: 'unauthorized' })
  const body = await readBody(req)
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) return json(req, 400, { error: 'invalid_input' })
  const { error } = await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
  return error ? json(req, 500, { error: 'unavailable' }) : json(req, 200, { ok: true })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function notify(req: Request): Promise<Response> {
  const expected = env('PUSH_WEBHOOK_SECRET')
  const given = req.headers.get('x-push-secret') ?? ''
  if (!expected || !safeEqual(given, expected)) return json(req, 401, { error: 'unauthorized' })
  if (!ensureVapid()) return json(req, 503, { error: 'not_configured' })

  const body = await readBody(req)
  const messageId = body?.message_id
  if (typeof messageId !== 'string' || !UUID.test(messageId)) return json(req, 400, { error: 'invalid_input' })

  const { data: message } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, kind, body, audio_duration_ms, created_at')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return json(req, 200, { ok: true, sent: 0 })
  if (Date.now() - new Date(message.created_at as string).getTime() > MAX_MESSAGE_AGE_MS) return json(req, 200, { ok: true, sent: 0 })

  const [{ data: conversation }, { data: sender }, { data: members }] = await Promise.all([
    admin.from('conversations').select('kind, name, archived_at').eq('id', message.conversation_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', message.sender_id).maybeSingle(),
    admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .neq('user_id', message.sender_id)
      .limit(MAX_RECIPIENTS),
  ])
  if (!conversation || conversation.archived_at) return json(req, 200, { ok: true, sent: 0 })
  const recipients = (members ?? []).map((m) => m.user_id as string)
  if (recipients.length === 0) return json(req, 200, { ok: true, sent: 0 })

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, locale')
    .in('user_id', recipients)
  if (!subscriptions || subscriptions.length === 0) return json(req, 200, { ok: true, sent: 0 })

  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const locale = normalizeLocale(sub.locale) ?? 'pt-PT'
      const payload = buildNotification(
        {
          conversationId: message.conversation_id as string,
          conversationKind: conversation.kind as 'direct' | 'group',
          conversationName: (conversation.name as string | null) ?? null,
          senderName: (sender?.display_name as string | undefined) ?? null,
          messageKind: message.kind as 'text' | 'audio',
          body: (message.body as string | null) ?? null,
          audioDurationMs: (message.audio_duration_ms as number | null) ?? null,
        },
        locale,
      )
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: 'high' },
        )
        return { id: sub.id as string, sent: true, gone: false }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        return { id: sub.id as string, sent: false, gone: status === 404 || status === 410 }
      }
    }),
  )

  // The push service says the subscription no longer exists: forget it.
  const gone = results.filter((r) => r.gone).map((r) => r.id)
  if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone)
  return json(req, 200, { ok: true, sent: results.filter((r) => r.sent).length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' })
  const route = new URL(req.url).pathname.replace(/\/+$/, '').split('/').pop()
  try {
    if (route === 'subscribe') return await subscribe(req)
    if (route === 'unsubscribe') return await unsubscribe(req)
    if (route === 'notify') return await notify(req)
  } catch {
    return json(req, 500, { error: 'unavailable' })
  }
  return json(req, 404, { error: 'not_found' })
})
