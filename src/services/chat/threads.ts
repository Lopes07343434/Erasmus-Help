/**
 * Read side of the chat: conversation list, conversation pages (keyset pagination), members,
 * read state (mark read, throttled), sender profiles (batched cache) and audio signed URLs (cached).
 */
import type { AppError } from '@/services/errors'
import {
  applyMyReadState,
  patchConversation,
  prependOlder,
  rememberProfiles,
  setConversations,
  setListStatus,
  setMembers,
  setSession,
  setThreadPage,
  updateThread,
  useChatStore,
} from './chatStore'
import { ChatError, toChatError } from './errors'
import { compareMessages, compareTimestamps, isUuid } from './mappers'
import { getLocalAudioUrl } from './outbox'
import {
  createAudioSignedUrl,
  fetchMessagesPage,
  fetchProfiles,
  getMyProfile,
  listConversationMembers,
  listMyConversations,
  markConversationRead as markConversationReadRpc,
} from './repository'
import { getGeneration, isOffline, myUserId } from './runtime'
import type { ChatMessage, PublicProfile } from './types'

const get = useChatStore.getState
const isReady = () => get().session.status === 'ready'

// ---------------------------------------------------------------------------
// Conversation list (single-flight, coalesced)
// ---------------------------------------------------------------------------

let listInFlight: Promise<void> | null = null
let listRerun = false
let listTimer: ReturnType<typeof setTimeout> | null = null

async function runListRefresh(): Promise<void> {
  const gen = getGeneration()
  const { list } = get()
  if (list.status === 'idle' || list.status === 'error') setListStatus('loading')
  try {
    const items = await listMyConversations()
    if (gen !== getGeneration()) return
    setConversations(items)
  } catch (err) {
    if (gen !== getGeneration()) return
    const error = toChatError(err)
    // Keep what we have on screen; only surface the error when there is nothing to show.
    if (get().list.status !== 'success') setListStatus('error', error)
  }
}

/** Reloads list_my_conversations (archived included). Concurrent calls share one request (+1 re-run). */
export function refreshConversations(): Promise<void> {
  if (!isReady()) return Promise.resolve()
  if (listInFlight) {
    listRerun = true
    return listInFlight
  }
  listInFlight = (async () => {
    try {
      do {
        listRerun = false
        await runListRefresh()
      } while (listRerun && isReady())
    } finally {
      listInFlight = null
    }
  })()
  return listInFlight
}

/** Debounced refresh (Realtime bursts: new memberships, unknown conversations). */
export function scheduleConversationsRefresh(delayMs = 300): void {
  if (listTimer) return
  listTimer = setTimeout(() => {
    listTimer = null
    void refreshConversations()
  }, delayMs)
}

/**
 * Re-reads my own profile (monitor verification / can_manage_groups are changed by admins and
 * `profiles` is not in the Realtime publication). Called on Realtime (re)subscription.
 */
export async function refreshMyProfile(): Promise<void> {
  const { session } = get()
  if (session.status !== 'ready' || !session.userId) return
  const gen = getGeneration()
  try {
    const me = await getMyProfile()
    if (gen === getGeneration() && me && me.id === get().session.userId) setSession({ me })
  } catch {
    // keep the current one
  }
}

// ---------------------------------------------------------------------------
// Sender profiles (batched: one `profiles` query per burst)
// ---------------------------------------------------------------------------

const profileQueue = new Set<string>()
const profileRequests = new Map<string, Promise<void>>()
/** Ids the server did not return (left the platform / not visible): retry after a while. */
const profileMisses = new Map<string, number>()
const PROFILE_MISS_TTL_MS = 60_000
let profileFlush: Promise<void> | null = null

function knownProfile(id: string): PublicProfile | undefined {
  return get().profiles[id]
}

async function flushProfiles(): Promise<void> {
  await Promise.resolve() // collect everything requested in the same tick
  profileFlush = null
  const ids = [...profileQueue]
  profileQueue.clear()
  if (ids.length === 0) return
  const gen = getGeneration()
  try {
    const found = await fetchProfiles(ids)
    if (gen !== getGeneration()) return
    rememberProfiles(found)
    const got = new Set(found.map((p) => p.id))
    for (const id of ids) if (!got.has(id)) profileMisses.set(id, Date.now())
  } catch {
    for (const id of ids) profileMisses.set(id, Date.now())
  } finally {
    for (const id of ids) profileRequests.delete(id)
  }
}

/** Makes sure the public profiles of these users are in the cache (no-op for cached ones). */
export function ensureProfiles(ids: Iterable<string>): Promise<void> {
  if (!isReady()) return Promise.resolve()
  const waits: Promise<void>[] = []
  for (const id of ids) {
    if (!isUuid(id) || knownProfile(id)) continue
    const pending = profileRequests.get(id)
    if (pending) {
      waits.push(pending)
      continue
    }
    const missAt = profileMisses.get(id)
    if (missAt !== undefined && Date.now() - missAt < PROFILE_MISS_TTL_MS) continue
    profileQueue.add(id)
    profileFlush ??= flushProfiles()
    profileRequests.set(id, profileFlush)
    waits.push(profileFlush)
  }
  return waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve()
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  await ensureProfiles([id])
  return knownProfile(id) ?? null
}

function ensureSenderProfiles(messages: readonly ChatMessage[]): void {
  const members = new Set((get().members[messages[0]?.conversationId ?? '']?.items ?? []).map((m) => m.id))
  void ensureProfiles(new Set(messages.map((m) => m.senderId).filter((id) => !members.has(id))))
}

// ---------------------------------------------------------------------------
// Conversation (summary + members + latest page)
// ---------------------------------------------------------------------------

const threadLoads = new Map<string, Promise<void>>()

async function runLoadConversation(conversationId: string): Promise<void> {
  const gen = getGeneration()
  const before = get().threads[conversationId]
  const background = before?.status === 'success'
  if (!background) updateThread(conversationId, (t) => ({ ...t, status: 'loading', error: null }))
  const fail = (error: AppError) => {
    if (gen !== getGeneration()) return
    if (background && error.code !== 'not-found') return // keep showing what we have
    updateThread(conversationId, (t) => ({ ...t, status: error.code === 'not-found' ? 'not-found' : 'error', error }))
  }
  try {
    if (!get().list.byId[conversationId]) {
      await refreshConversations()
      if (gen !== getGeneration()) return
      const { list } = get()
      if (!list.byId[conversationId]) {
        fail(list.status === 'error' && list.error ? list.error : new ChatError('not-found', 'not_found'))
        return
      }
    }
    const [members, page] = await Promise.all([listConversationMembers(conversationId), fetchMessagesPage(conversationId)])
    if (gen !== getGeneration()) return
    setMembers(conversationId, members)
    const current = get().threads[conversationId]
    const currentNewest = current?.items[current.items.length - 1]
    const first = page.messages[0]
    if (background && current && currentNewest && first && compareMessages(first, currentNewest) <= 0) {
      // Background refresh that connects to what is loaded: keep older pages and pagination state.
      setThreadPage(conversationId, [...current.items, ...page.messages], page.hasMore ? current.hasOlder : false)
    } else {
      setThreadPage(conversationId, page.messages, page.hasMore)
    }
    ensureSenderProfiles(page.messages)
  } catch (err) {
    fail(toChatError(err))
  }
}

/**
 * Loads a conversation (summary, members, newest page). When it is already loaded this is a background
 * refresh (no loading state; older pages kept when the new page connects to them).
 */
export function loadConversation(conversationId: string): Promise<void> {
  if (!isUuid(conversationId)) {
    updateThread(conversationId, (t) => ({ ...t, status: 'not-found', error: new ChatError('not-found', 'not_found') }))
    return Promise.resolve()
  }
  if (!isReady()) return Promise.resolve()
  const running = threadLoads.get(conversationId)
  if (running) return running
  const p = runLoadConversation(conversationId).finally(() => threadLoads.delete(conversationId))
  threadLoads.set(conversationId, p)
  return p
}

/** Older page (keyset on created_at, id). Rejects with AppError on failure; `hasOlder` stays true for a retry. */
export async function loadOlderMessages(conversationId: string): Promise<void> {
  const t = get().threads[conversationId]
  if (!t || t.status !== 'success' || !t.hasOlder || t.loadingOlder) return
  const oldest = t.items[0]
  if (!oldest) return
  const gen = getGeneration()
  updateThread(conversationId, (th) => ({ ...th, loadingOlder: true }))
  try {
    const page = await fetchMessagesPage(conversationId, { createdAt: oldest.createdAt, id: oldest.id })
    if (gen !== getGeneration()) return
    prependOlder(conversationId, page.messages, page.hasMore)
    ensureSenderProfiles(page.messages)
  } catch (err) {
    if (gen === getGeneration()) updateThread(conversationId, (th) => ({ ...th, loadingOlder: false }))
    throw toChatError(err)
  }
}

export async function refreshMembers(conversationId: string): Promise<void> {
  if (!isReady()) return
  const gen = getGeneration()
  try {
    const members = await listConversationMembers(conversationId)
    if (gen === getGeneration()) setMembers(conversationId, members)
  } catch {
    // keep the previous list; the next load/resync fixes it
  }
}

const memberTimers = new Map<string, ReturnType<typeof setTimeout>>()
export function scheduleMembersRefresh(conversationId: string, delayMs = 300): void {
  if (memberTimers.has(conversationId)) return
  memberTimers.set(
    conversationId,
    setTimeout(() => {
      memberTimers.delete(conversationId)
      void refreshMembers(conversationId)
    }, delayMs),
  )
}

// ---------------------------------------------------------------------------
// Mark read (throttled per conversation: leading call + one trailing call per window)
// ---------------------------------------------------------------------------

export const MARK_READ_THROTTLE_MS = 2_000
const markLast = new Map<string, number>()
const markTimers = new Map<string, ReturnType<typeof setTimeout>>()

function needsMarkRead(conversationId: string, me: string): boolean {
  const s = get()
  const summary = s.list.byId[conversationId]
  if (!summary) return false
  if (summary.unreadCount > 0) return true
  const myRead = s.members[conversationId]?.items.find((m) => m.id === me)?.lastReadAt
  if (!myRead) return true
  const t = s.threads[conversationId]
  const newestOther = t ? [...t.items].reverse().find((m) => m.senderId !== me) : undefined
  const newest = newestOther?.createdAt ?? (summary.lastMessage && summary.lastMessage.senderId !== me ? summary.lastMessage.createdAt : null)
  return newest !== null && compareTimestamps(newest, myRead) > 0
}

async function doMarkRead(conversationId: string): Promise<void> {
  const me = myUserId()
  if (!isReady() || !me || isOffline() || !needsMarkRead(conversationId, me)) return
  const gen = getGeneration()
  patchConversation(conversationId, { unreadCount: 0 })
  try {
    const lastReadAt = await markConversationReadRpc(conversationId)
    if (gen === getGeneration() && lastReadAt) applyMyReadState(conversationId, me, lastReadAt)
  } catch {
    // Not surfaced: the next list refresh restores the real unread count.
  }
}

export function markConversationRead(conversationId: string): void {
  if (!isUuid(conversationId) || markTimers.has(conversationId)) return
  const wait = (markLast.get(conversationId) ?? 0) + MARK_READ_THROTTLE_MS - Date.now()
  if (wait <= 0) {
    markLast.set(conversationId, Date.now())
    void doMarkRead(conversationId)
    return
  }
  markTimers.set(
    conversationId,
    setTimeout(() => {
      markTimers.delete(conversationId)
      markLast.set(conversationId, Date.now())
      void doMarkRead(conversationId)
    }, wait),
  )
}

// ---------------------------------------------------------------------------
// Audio URLs (signed 5 min, cached ~4 min)
// ---------------------------------------------------------------------------

export const SIGNED_URL_CACHE_MS = 4 * 60_000
const signedUrls = new Map<string, { url: string; at: number }>()
const signedUrlRequests = new Map<string, Promise<string>>()

export async function getAudioUrl(conversationId: string, audioPath: string): Promise<string> {
  if (typeof audioPath !== 'string' || !audioPath.startsWith(`${conversationId}/`) || audioPath.includes('..')) throw new ChatError('invalid-input', 'invalid_input')
  const local = getLocalAudioUrl(audioPath)
  if (local) return local
  const cached = signedUrls.get(audioPath)
  if (cached && Date.now() - cached.at < SIGNED_URL_CACHE_MS) return cached.url
  const running = signedUrlRequests.get(audioPath)
  if (running) return running
  const gen = getGeneration()
  const p = createAudioSignedUrl(audioPath)
    .then((url) => {
      if (gen === getGeneration()) signedUrls.set(audioPath, { url, at: Date.now() })
      return url
    })
    .finally(() => signedUrlRequests.delete(audioPath))
  signedUrlRequests.set(audioPath, p)
  return p
}

// ---------------------------------------------------------------------------

/** Clears every cache/timer of this module (sign-out / identity change). */
export function clearThreadCaches(): void {
  if (listTimer) clearTimeout(listTimer)
  listTimer = null
  listRerun = false
  listInFlight = null
  profileQueue.clear()
  profileRequests.clear()
  profileMisses.clear()
  profileFlush = null
  threadLoads.clear()
  for (const t of memberTimers.values()) clearTimeout(t)
  memberTimers.clear()
  for (const t of markTimers.values()) clearTimeout(t)
  markTimers.clear()
  markLast.clear()
  signedUrls.clear()
  signedUrlRequests.clear()
}
