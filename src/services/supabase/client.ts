import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import type { Database } from './database.types'
import { SUPABASE_AUTH_STORAGE_KEY } from './authStorage'

/**
 * Lazily-created, typed Supabase client (browser). `null` when VITE_SUPABASE_URL /
 * VITE_SUPABASE_PUBLISHABLE_KEY are missing → the chat reports 'not-configured'.
 *
 * Only the publishable (anon) key is ever used: data access is enforced by RLS.
 * Service keys (`sb_secret_…` or a legacy JWT whose role is `service_role`) are refused.
 */
export type ChatSupabaseClient = SupabaseClient<Database>

export { SUPABASE_AUTH_STORAGE_KEY } from './authStorage'

/** Gentle reconnect backoff for the Realtime socket (ms): 1 s, 2 s, 5 s, 10 s, 20 s, then every 30 s. */
const REALTIME_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 20_000] as const
export const realtimeReconnectAfterMs = (tries: number): number => REALTIME_BACKOFF_MS[tries - 1] ?? 30_000

let client: ChatSupabaseClient | null | undefined

/** True when the key is a legacy JWT carrying `role: service_role` (must never reach the browser). */
export function isServiceRoleJwt(key: string): boolean {
  const parts = key.split('.')
  if (parts.length !== 3 || !parts[1]) return false
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const payload: unknown = JSON.parse(json)
    return typeof payload === 'object' && payload !== null && (payload as { role?: unknown }).role === 'service_role'
  } catch {
    return false
  }
}

export function getSupabase(): ChatSupabaseClient | null {
  if (client !== undefined) return client
  const url = env.supabaseUrl
  const key = env.supabasePublishableKey
  // Vitest also loads .env.local: tests must never reach the real project (chat tests mock this module).
  const isTest = import.meta.env.MODE === 'test'
  if (isTest || !url || !key || key.startsWith('sb_secret_') || isServiceRoleJwt(key)) {
    client = null
    return client
  }
  client = createClient<Database>(url, key, {
    auth: {
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // Anonymous sign-in only: no OAuth / magic-link redirects to parse.
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
    realtime: {
      reconnectAfterMs: realtimeReconnectAfterMs,
      timeout: 10_000,
      heartbeatIntervalMs: 25_000,
    },
  })
  return client
}
