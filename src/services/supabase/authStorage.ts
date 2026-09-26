/** localStorage key of the persisted auth session (anonymous sign-in per device). */
export const SUPABASE_AUTH_STORAGE_KEY = 'eh:auth'

/** Removes every auth-js key for this app from localStorage (session, PKCE verifier, user). Never throws. */
export function clearPersistedAuth(): void {
  for (const key of [SUPABASE_AUTH_STORAGE_KEY, `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`, `${SUPABASE_AUTH_STORAGE_KEY}-user`]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // storage unavailable (private mode) — nothing persisted to remove
    }
  }
}
