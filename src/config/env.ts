/**
 * Single typed entry point for build-time configuration.
 * Only VITE_* variables reach the browser bundle, so NEVER put secrets here:
 * private keys live in the backend / Supabase Edge Functions that VITE_API_BASE_URL points to.
 */

export type RemoteProvider = 'http' | 'mock' | 'none'
export type SttProvider = 'browser' | 'mock' | 'none'
export type TtsProvider = 'browser' | 'none'
export type WeatherProvider = 'open-meteo' | 'none'

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function optionalUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? url.toString().replace(/\/$/, '')
      : null
  } catch {
    return null
  }
}

const e = import.meta.env

export const env = {
  isDev: e.DEV,
  apiBaseUrl: optionalUrl(e.VITE_API_BASE_URL),
  translationProvider: pick<RemoteProvider>(e.VITE_TRANSLATION_PROVIDER, ['http', 'mock', 'none'], 'none'),
  aiProvider: pick<RemoteProvider>(e.VITE_AI_PROVIDER, ['http', 'mock', 'none'], 'none'),
  sttProvider: pick<SttProvider>(e.VITE_STT_PROVIDER, ['browser', 'mock', 'none'], 'browser'),
  ttsProvider: pick<TtsProvider>(e.VITE_TTS_PROVIDER, ['browser', 'none'], 'browser'),
  weatherProvider: pick<WeatherProvider>(e.VITE_WEATHER_PROVIDER, ['open-meteo', 'none'], 'open-meteo'),
  vapidPublicKey: e.VITE_VAPID_PUBLIC_KEY || null,
  supabaseUrl: optionalUrl(e.VITE_SUPABASE_URL),
  /** Publishable (anon) key — public by design; data access is enforced by RLS. Never the service_role key. */
  supabasePublishableKey: e.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_') ? null : e.VITE_SUPABASE_PUBLISHABLE_KEY || null,
} as const

export type Env = typeof env
