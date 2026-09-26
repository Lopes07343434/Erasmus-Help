/**
 * Chat session: anonymous Supabase sign-in per device + profile sync, bootstrapped once app-wide.
 *
 *   not configured (no VITE_SUPABASE_*)      → 'not-configured'
 *   local onboarding not complete            → 'idle' (hooks show 'connecting'; nothing is sent)
 *   getSession → (none) signInAnonymously    → 'connecting'
 *   get_my_profile → upsert_my_profile if missing/different
 *   → 'ready' (me.publicId = the user's "ID 07"), Realtime channel + conversation list
 *
 * Errors: offline → 'offline' (auto-retry on the `online` event); anything else → 'error' with a
 * ChatError (e.g. detail 'anonymous_disabled') and a manual retry(). A stored session is never
 * replaced by a new anonymous user because of a network error (only when it is really invalid).
 *
 * Later changes of name / languages / country / city are pushed with a debounced upsert.
 */
import { AppError } from '@/services/errors'
import { clearPersistedAuth } from '@/services/supabase/authStorage'
import { getSupabase, type ChatSupabaseClient } from '@/services/supabase/client'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { validateName } from '@/utils/validation'
import { resetChatStore, setSession, useChatStore } from './chatStore'
import { ChatError, getChatErrorDetail, toChatError } from './errors'
import { cleanLine, codePointLength } from './mappers'
import { clearOutbox } from './outbox'
import { startRealtime, stopRealtime } from './realtime'
import { getMyProfile, upsertMyProfile, type UpsertProfileInput } from './repository'
import { bumpGeneration, getGeneration, isOffline } from './runtime'
import { clearThreadCaches, refreshConversations } from './threads'
import { CHAT_LIMITS, type MyProfile } from './types'

export const PROFILE_SYNC_DEBOUNCE_MS = 1_500

let started = false
let bootstrapping: Promise<void> | null = null
let cleanups: Array<() => void> = []
/** After signOutChat: do not auto-start again until onboarding is redone (new timestamp) or retry(). */
let blockedOnboardingAt: string | null | undefined
let signingOut = false

let lastSyncedKey: string | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncDirty = false

const get = useChatStore.getState

// ---------------------------------------------------------------------------
// Local profile → server
// ---------------------------------------------------------------------------

/** The local (onboarding) profile in the shape of upsert_my_profile, or null when incomplete. */
export function readLocalProfile(): UpsertProfileInput | null {
  const p = useProfileStore.getState()
  const { appLanguage } = useSettingsStore.getState()
  if (!p.onboardingCompletedAt || !p.role) return null
  const name = validateName(p.name)
  if (!name.ok) return null
  const city = p.location ? cleanLine(p.location.city.name) : ''
  return {
    displayName: cleanLine(name.value),
    role: p.role,
    myLanguage: p.myLanguage,
    appLanguage,
    countryCode: p.location?.countryCode ?? null,
    city: city && codePointLength(city) <= CHAT_LIMITS.cityMaxLength ? city : null,
  }
}

const keyOf = (p: UpsertProfileInput): string => JSON.stringify([p.displayName, p.myLanguage, p.appLanguage, p.countryCode, p.city])

/** The server keeps fields we omit (null): only compare what we would send. */
function differs(me: MyProfile, local: UpsertProfileInput): boolean {
  return (
    me.displayName !== local.displayName ||
    (local.myLanguage !== null && me.myLanguage !== local.myLanguage) ||
    (local.appLanguage !== null && me.appLanguage !== local.appLanguage) ||
    (local.countryCode !== null && me.countryCode !== local.countryCode) ||
    (local.city !== null && me.city !== local.city)
  )
}

async function syncProfileNow(): Promise<void> {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  const local = readLocalProfile()
  if (!local || get().session.status !== 'ready') return
  const key = keyOf(local)
  if (key === lastSyncedKey) {
    syncDirty = false
    return
  }
  if (isOffline()) {
    syncDirty = true
    return
  }
  const gen = getGeneration()
  try {
    const me = await upsertMyProfile(local)
    if (gen !== getGeneration()) return
    lastSyncedKey = key
    syncDirty = false
    setSession({ me })
  } catch {
    if (gen === getGeneration()) syncDirty = true // retried on the next change / when back online
  }
}

function scheduleProfileSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void syncProfileNow(), PROFILE_SYNC_DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function canAutoStart(): boolean {
  const at = useProfileStore.getState().onboardingCompletedAt
  if (!at) return false
  if (blockedOnboardingAt !== undefined) {
    if (at === blockedOnboardingAt) return false
    blockedOnboardingAt = undefined
  }
  return readLocalProfile() !== null
}

/** Existing (valid) session user, or a new anonymous user. */
async function ensureAuthUser(sb: ChatSupabaseClient): Promise<string> {
  let existing: string | null = null
  try {
    const { data, error } = await sb.auth.getSession()
    if (error) {
      const mapped = toChatError(error)
      // A stored session that is really invalid (revoked / refresh token gone) → start over below.
      if (getChatErrorDetail(mapped) !== 'not_authenticated') throw mapped
    } else {
      existing = data.session?.user.id ?? null
    }
  } catch (err) {
    throw toChatError(err)
  }
  if (existing) return existing
  if (isOffline()) throw new AppError('offline')
  let res: Awaited<ReturnType<ChatSupabaseClient['auth']['signInAnonymously']>>
  try {
    res = await sb.auth.signInAnonymously()
  } catch (err) {
    throw toChatError(err)
  }
  if (res.error) throw toChatError(res.error)
  const id = res.data.user?.id ?? res.data.session?.user.id
  if (!id) throw new ChatError('unknown')
  return id
}

async function runBootstrap(): Promise<void> {
  const gen = getGeneration()
  setSession({ status: 'connecting', error: null })
  try {
    const sb = getSupabase()
    if (!sb) throw new ChatError('not-configured')
    const local = readLocalProfile()
    if (!local) throw new ChatError('invalid-input', 'invalid_input')
    if (isOffline()) throw new AppError('offline')
    const userId = await ensureAuthUser(sb)
    if (gen !== getGeneration()) return
    let me = await getMyProfile()
    if (gen !== getGeneration()) return
    const latest = readLocalProfile() ?? local
    if (!me || me.id !== userId || differs(me, latest)) me = await upsertMyProfile(latest)
    if (gen !== getGeneration()) return
    lastSyncedKey = keyOf(latest)
    setSession({ status: 'ready', userId, me, error: null })
    startRealtime(userId)
    void refreshConversations()
    // The local profile may have changed while we were connecting.
    const now = readLocalProfile()
    if (now && keyOf(now) !== lastSyncedKey) scheduleProfileSync()
  } catch (err) {
    if (gen !== getGeneration()) return
    const error = toChatError(err)
    const status = error.code === 'not-configured' && getChatErrorDetail(error) === null ? 'not-configured' : error.code === 'offline' ? 'offline' : 'error'
    setSession({ status, error, me: null, userId: null })
  }
}

function bootstrap(): Promise<void> {
  if (bootstrapping) return bootstrapping
  const p: Promise<void> = runBootstrap().finally(() => {
    if (bootstrapping === p) bootstrapping = null
  })
  bootstrapping = p
  return p
}

/** Stops Realtime, drops every cache and the store (no sign-out). */
function teardown(): void {
  bumpGeneration()
  stopRealtime()
  clearThreadCaches()
  clearOutbox()
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  syncDirty = false
  lastSyncedKey = null
  bootstrapping = null
  resetChatStore()
}

function onLocalChange(): void {
  const { status } = get().session
  if (status === 'not-configured') return
  if (!useProfileStore.getState().onboardingCompletedAt) {
    // Local data wiped / onboarding restarted: stop using the chat on this device.
    if (status !== 'idle') teardown()
    return
  }
  if (status === 'idle') {
    if (canAutoStart()) void bootstrap()
    return
  }
  if (status === 'ready') {
    const local = readLocalProfile()
    if (local && keyOf(local) !== lastSyncedKey) scheduleProfileSync()
  }
}

function onOnline(): void {
  const { status, error } = get().session
  if (status === 'offline' || (status === 'error' && error && (error.code === 'unavailable' || error.code === 'timeout'))) {
    if (canAutoStart()) void bootstrap()
  } else if (status === 'ready' && syncDirty) {
    void syncProfileNow()
  }
}

function onAuthEvent(event: string, userId: string | null, external: boolean): void {
  const { session } = get()
  if (event === 'SIGNED_OUT') {
    if (!external || session.status === 'idle') return
    // Session revoked/expired elsewhere (or another tab signed out): never silently create a new identity.
    teardown()
    setSession({ status: 'error', error: new ChatError('permission-denied', 'not_authenticated') })
    return
  }
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && userId && session.status === 'ready' && session.userId && userId !== session.userId) {
    // Another tab replaced the identity: restart with the new user.
    teardown()
    if (canAutoStart()) void bootstrap()
  }
}

/** Idempotent: first call wires listeners and starts the session when the user is onboarded. */
export function startChat(): void {
  if (started) return
  started = true
  const sb = getSupabase()
  if (!sb) {
    setSession({ status: 'not-configured', error: new ChatError('not-configured') })
    return
  }
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    const external = !signingOut
    const userId = session?.user.id ?? null
    // Never call Supabase from inside the auth callback (auth lock): defer.
    setTimeout(() => onAuthEvent(event, userId, external), 0)
  })
  const unsubProfile = useProfileStore.subscribe(onLocalChange)
  const unsubSettings = useSettingsStore.subscribe(onLocalChange)
  window.addEventListener('online', onOnline)
  cleanups = [
    () => data.subscription.unsubscribe(),
    unsubProfile,
    unsubSettings,
    () => window.removeEventListener('online', onOnline),
  ]
  if (canAutoStart()) void bootstrap()
}

/** Manual retry (session error / offline). Also lifts the post-sign-out block. */
export function retryChatSession(): void {
  if (!started) startChat()
  const { status } = get().session
  if (status === 'ready' || status === 'connecting' || status === 'not-configured') return
  blockedOnboardingAt = undefined
  if (canAutoStart()) void bootstrap()
}

/**
 * "Apagar dados deste dispositivo": signs out of the chat LOCALLY (scope 'local': the anonymous
 * user stays on the server, this device forgets it) and clears every chat cache. After this the
 * chat stays idle until the onboarding is completed again (a new anonymous user / new public ID).
 * Safe to call when chat is not configured or never started. Never throws.
 */
export async function signOutChat(): Promise<void> {
  blockedOnboardingAt = useProfileStore.getState().onboardingCompletedAt
  teardown()
  const sb = getSupabase()
  if (!sb) {
    if (started) setSession({ status: 'not-configured', error: new ChatError('not-configured') })
    return
  }
  signingOut = true
  try {
    await sb.auth.signOut({ scope: 'local' })
  } catch {
    // handled below: the stored session is removed explicitly either way
  } finally {
    // auth-js returns early (without clearing storage) when loading the session fails, e.g. offline with an
    // expired access token — so wipe the persisted session ourselves; otherwise the next person to onboard
    // on this device would inherit this identity.
    clearPersistedAuth()
    signingOut = false
  }
}

/** Test helper: tears everything down, including listeners, as if the app had just loaded. */
export function disposeChat(): void {
  teardown()
  for (const c of cleanups) c()
  cleanups = []
  started = false
  blockedOnboardingAt = undefined
  signingOut = false
}
