import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { toChatError } from '@/services/chat/errors'
import { AppError } from '../errors'
import { getSupabase, type ChatSupabaseClient } from '../supabase/client'

/**
 * Server side of Web Push (Supabase): the devices' subscriptions live in `push_subscriptions` and are written only
 * through the RPCs register_push_subscription / unregister_push_subscription (they act on the signed-in chat account).
 * Delivery is done by the Edge Function `send-push`, which holds the VAPID private key.
 */

export type PushDevicePlatform = 'android' | 'ios' | 'desktop' | 'other'

export interface PushRegistration {
  endpoint: string
  p256dh: string
  auth: string
  platform: PushDevicePlatform
  /** App language (pt-PT / en / pl): the language of the notifications this device receives. */
  locale?: string
}

/** Needs the anonymous chat session (created after onboarding): without it the server cannot link the device. */
async function requireSignedIn(): Promise<ChatSupabaseClient> {
  const sb = getSupabase()
  if (!sb) throw new AppError('not-configured')
  let signedIn: boolean
  try {
    signedIn = (await sb.auth.getSession()).data.session !== null
  } catch (err) {
    throw toChatError(err)
  }
  if (!signedIn) throw new AppError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable')
  return sb
}

export async function registerPushSubscription(registration: PushRegistration): Promise<void> {
  const sb = await requireSignedIn()
  let error: unknown
  try {
    ;({ error } = await sb.rpc('register_push_subscription', {
      p_endpoint: registration.endpoint,
      p_p256dh: registration.p256dh,
      p_auth: registration.auth,
      p_platform: registration.platform,
      ...(registration.locale ? { p_locale: registration.locale } : {}),
    }))
  } catch (err) {
    throw toChatError(err)
  }
  if (error) throw toChatError(error)
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  const sb = await requireSignedIn()
  let error: unknown
  try {
    ;({ error } = await sb.rpc('unregister_push_subscription', { p_endpoint: endpoint }))
  } catch (err) {
    throw toChatError(err)
  }
  if (error) throw toChatError(error)
}

/**
 * Asks the Edge Function to push a test notification to the caller's own devices (real delivery through the push
 * service). Resolves with how many devices were notified.
 * @throws AppError 'not-found' (no registered device), 'rate-limited' (one test per 30 s), 'not-configured' (server
 *   without VAPID keys), 'permission-denied' (no valid session), 'unavailable' / 'offline'.
 */
export async function sendTestPush(): Promise<number> {
  const sb = await requireSignedIn()
  let result: Awaited<ReturnType<typeof sb.functions.invoke>>
  try {
    result = await sb.functions.invoke('send-push', { body: { campaign: 'test' } })
  } catch (err) {
    throw toChatError(err)
  }
  const { data, error } = result
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response).status
      if (status === 404) throw new AppError('not-found', error)
      if (status === 429) throw new AppError('rate-limited', error)
      if (status === 401) throw new AppError('permission-denied', error)
      if (status === 503) throw new AppError('not-configured', error)
      throw new AppError('unavailable', error)
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new AppError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable', error)
    }
    throw toChatError(error)
  }
  const sent = (data as { sent?: unknown } | null)?.sent
  if (typeof sent !== 'number' || sent < 1) throw new AppError('unavailable')
  return sent
}
