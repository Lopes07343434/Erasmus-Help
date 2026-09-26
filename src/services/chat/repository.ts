/**
 * Chat repository: every Supabase call of the chat (RPCs, tables, storage) in one place.
 *
 * Rules enforced here:
 *  - explicit column lists (profiles has column privileges: `select('*')` fails by design);
 *  - results are parsed from `unknown` (mappers.ts); errors are mapped to AppError/ChatError;
 *  - messages are inserted with a client-generated id (idempotent retries) and without
 *    created_at (server time); audio is uploaded first with a plain content type.
 * No service keys, no RLS bypass: everything runs as the signed-in (anonymous) user.
 */
import { getSupabase, type ChatSupabaseClient } from '@/services/supabase/client'
import type { TablesInsert } from '@/services/supabase/database.types'
import type { AdminUserRow } from './api'
import { ChatError, toChatError } from './errors'
import {
  isUuid,
  parseConversationRow,
  parseMemberRow,
  parseMessageRow,
  parseMyProfile,
  parsePersonSearchRow,
  parsePublicProfile,
} from './mappers'
import {
  CHAT_AUDIO_BUCKET,
  CHAT_AVATAR_BUCKET,
  CHAT_LIMITS,
  type ChatAudioMimeType,
  type ChatMessage,
  type ConversationSummary,
  type GroupMember,
  type MemberRole,
  type MyProfile,
  type PersonSearchResult,
  type PublicProfile,
  type UserRole,
} from './types'
import { isRecord } from '@/services/http'

/** Columns of public.messages the client reads (all of them, named). */
export const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,kind,body,audio_path,audio_duration_ms,audio_mime,created_at'
/** Columns of public.profiles other users may read (column privileges) that the chat needs. */
export const PUBLIC_PROFILE_COLUMNS = 'id,public_id,display_name,role,avatar_path'

export const MESSAGES_PAGE_SIZE = 50
/** Signed URLs live 5 min; callers cache them ~4 min. */
export const SIGNED_URL_TTL_SECONDS = 300

export function requireClient(): ChatSupabaseClient {
  const sb = getSupabase()
  if (!sb) throw new ChatError('not-configured')
  return sb
}

interface SupabaseResult {
  data: unknown
  error: unknown
  status?: number
}

/** Throws the mapped error of a supabase-js result; returns its data as unknown. */
function unwrap(res: SupabaseResult): unknown {
  if (res.error) throw toChatError(res.error, res.status ?? null)
  return res.data
}

async function call<T extends SupabaseResult>(run: () => PromiseLike<T>): Promise<unknown> {
  let res: T
  try {
    res = await run()
  } catch (err) {
    throw toChatError(err)
  }
  return unwrap(res)
}

function parseList<T>(data: unknown, parse: (row: unknown) => T | null): T[] {
  if (!Array.isArray(data)) throw new ChatError('unknown')
  const out: T[] = []
  for (const row of data) {
    const item = parse(row)
    if (item) out.push(item)
  }
  return out
}

/** PostgREST logic-tree value quoting (timestamps contain ':' '.' '+'). */
const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getMyProfile(): Promise<MyProfile | null> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('get_my_profile'))
  const rows = Array.isArray(data) ? data : data == null ? [] : [data]
  if (rows.length === 0) return null
  const me = parseMyProfile(rows[0])
  if (!me) throw new ChatError('unknown')
  return me
}

export interface UpsertProfileInput {
  displayName: string
  role: 'student' | 'monitor'
  myLanguage: string | null
  appLanguage: string | null
  countryCode: string | null
  city: string | null
}

export async function upsertMyProfile(input: UpsertProfileInput): Promise<MyProfile> {
  const sb = requireClient()
  const args: {
    p_display_name: string
    p_role: 'student' | 'monitor'
    p_my_language?: string
    p_app_language?: string
    p_country_code?: string
    p_city?: string
  } = { p_display_name: input.displayName, p_role: input.role }
  if (input.myLanguage) args.p_my_language = input.myLanguage
  if (input.appLanguage) args.p_app_language = input.appLanguage
  if (input.countryCode) args.p_country_code = input.countryCode
  if (input.city) args.p_city = input.city
  const data = await call(() => sb.rpc('upsert_my_profile', args))
  const me = parseMyProfile(Array.isArray(data) ? data[0] : data)
  if (!me) throw new ChatError('unknown')
  return me
}

/** Public profiles by user id (senders of messages, incl. people who left). One query for all ids. */
export async function fetchProfiles(ids: readonly string[]): Promise<PublicProfile[]> {
  const valid = [...new Set(ids.filter(isUuid))]
  if (valid.length === 0) return []
  const sb = requireClient()
  const data = await call(() => sb.from('profiles').select(PUBLIC_PROFILE_COLUMNS).in('id', valid))
  return parseList(data, (row) => parsePublicProfile(row))
}

/** People directory: by ID ("07" → exact ID first, then IDs starting with 7) or by name. Never includes me. */
export async function searchProfiles(query: string, limit: number = CHAT_LIMITS.searchResultsLimit): Promise<PersonSearchResult[]> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('search_profiles', { p_query: query, p_limit: limit }))
  return parseList(data, parsePersonSearchRow)
}

// ---------------------------------------------------------------------------
// Photos (public bucket `avatars`)
// ---------------------------------------------------------------------------

/** Public URL of a photo (no request). null when chat is not configured. */
export function avatarPublicUrl(path: string): string | null {
  const sb = getSupabase()
  if (!sb) return null
  return sb.storage.from(CHAT_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl || null
}

/** Uploads a new photo object (never overwrites: every photo gets a new random name). */
export async function uploadAvatar(path: string, jpeg: Blob): Promise<void> {
  const sb = requireClient()
  const body = jpeg.type === 'image/jpeg' ? jpeg : new Blob([jpeg], { type: 'image/jpeg' })
  let res: SupabaseResult
  try {
    res = await sb.storage.from(CHAT_AVATAR_BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
  } catch (err) {
    throw toChatError(err)
  }
  if (res.error && isAlreadyExists(res.error)) return
  unwrap(res)
}

/** Best effort: removes a photo object that is no longer used (errors are ignored). */
export async function removeAvatarObject(path: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  try {
    await sb.storage.from(CHAT_AVATAR_BUCKET).remove([path])
  } catch {
    // an orphan photo only costs storage
  }
}

/** Sets (path) or removes (null) my photo. The object must already be uploaded. Returns the stored path. */
export async function setMyAvatar(path: string | null): Promise<string | null> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('set_my_avatar', path ? { p_path: path } : {}))
  return typeof data === 'string' && data ? data : null
}

/** Group administrators: sets (path) or removes (null) the group photo. Returns the stored path. */
export async function setGroupAvatar(conversationId: string, path: string | null): Promise<string | null> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('set_group_avatar', path ? { p_conversation: conversationId, p_path: path } : { p_conversation: conversationId }))
  return typeof data === 'string' && data ? data : null
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/** Opens (creates or reactivates) the direct conversation with the person behind a public ID. Returns its id. */
export async function startDirectConversation(publicId: number): Promise<string> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('start_direct_conversation', { p_public_id: publicId }))
  if (!isUuid(data)) throw new ChatError('unknown')
  return data
}

/** All my conversations, archived included (the list RPC already aggregates last message + unread). */
export async function listMyConversations(): Promise<ConversationSummary[]> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('list_my_conversations', { p_include_archived: true }))
  return parseList(data, parseConversationRow)
}

export async function listConversationMembers(conversationId: string): Promise<GroupMember[]> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('list_conversation_members', { p_conversation: conversationId }))
  return parseList(data, parseMemberRow)
}

/** Returns my resulting last_read_at. */
export async function markConversationRead(conversationId: string): Promise<string | null> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('mark_conversation_read', { p_conversation: conversationId }))
  return typeof data === 'string' ? data : null
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MessagePage {
  /** Chronological (oldest → newest). */
  messages: ChatMessage[]
  hasMore: boolean
}

/**
 * Newest page, or the page just before `before` (keyset on created_at desc, id desc).
 * Fetches one extra row to know whether older messages exist.
 */
export async function fetchMessagesPage(conversationId: string, before?: { createdAt: string; id: string }, pageSize = MESSAGES_PAGE_SIZE): Promise<MessagePage> {
  const sb = requireClient()
  const data = await call(() => {
    let query = sb.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId)
    if (before) {
      query = query.or(`created_at.lt.${q(before.createdAt)},and(created_at.eq.${q(before.createdAt)},id.lt.${before.id})`)
    }
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1)
  })
  const rows = parseList(data, parseMessageRow)
  const hasMore = Array.isArray(data) && data.length > pageSize
  return { messages: rows.slice(0, pageSize).reverse(), hasMore }
}

async function fetchMessageById(id: string): Promise<ChatMessage | null> {
  const sb = requireClient()
  const data = await call(() => sb.from('messages').select(MESSAGE_COLUMNS).eq('id', id).maybeSingle())
  return data == null ? null : parseMessageRow(data)
}

export type NewMessageInput =
  | { id: string; conversationId: string; senderId: string; kind: 'text'; body: string }
  | { id: string; conversationId: string; senderId: string; kind: 'audio'; audioPath: string; audioDurationMs: number; audioMime: ChatAudioMimeType }

/**
 * Inserts a message (never created_at: server time). Idempotent: when a previous attempt with the
 * same id already landed (23505), the stored row is returned.
 */
export async function insertMessage(input: NewMessageInput): Promise<ChatMessage> {
  const sb = requireClient()
  const row: TablesInsert<'messages'> =
    input.kind === 'text'
      ? { id: input.id, conversation_id: input.conversationId, sender_id: input.senderId, kind: 'text' as const, body: input.body }
      : {
          id: input.id,
          conversation_id: input.conversationId,
          sender_id: input.senderId,
          kind: 'audio' as const,
          audio_path: input.audioPath,
          audio_duration_ms: input.audioDurationMs,
          audio_mime: input.audioMime,
        }
  let res: SupabaseResult
  try {
    res = await sb.from('messages').insert(row).select(MESSAGE_COLUMNS).single()
  } catch (err) {
    throw toChatError(err)
  }
  if (res.error && isRecord(res.error) && res.error.code === '23505') {
    const existing = await fetchMessageById(input.id)
    if (existing) return existing
  }
  const msg = parseMessageRow(unwrap(res))
  if (!msg) throw new ChatError('unknown')
  return msg
}

// ---------------------------------------------------------------------------
// Audio (Storage)
// ---------------------------------------------------------------------------

function isAlreadyExists(error: unknown): boolean {
  if (!isRecord(error)) return false
  const sc = String(error.statusCode ?? error.status ?? '')
  const msg = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return sc === '409' || error.code === 'Duplicate' || error.code === 'ResourceAlreadyExists' || msg.includes('already exists')
}

/**
 * Uploads the audio object (no upsert). An object already at that path (earlier attempt) counts as uploaded.
 * storage-js sends a Blob as multipart using the Blob's OWN type (the `contentType` option is ignored for
 * Blobs), and MediaRecorder blobs carry ';codecs=…' → re-wrap it with the plain type the bucket allows.
 */
export async function uploadAudio(path: string, blob: Blob, contentType: ChatAudioMimeType): Promise<void> {
  const sb = requireClient()
  const body = blob.type === contentType ? blob : new Blob([blob], { type: contentType })
  let res: SupabaseResult
  try {
    res = await sb.storage.from(CHAT_AUDIO_BUCKET).upload(path, body, { contentType, upsert: false, cacheControl: '3600' })
  } catch (err) {
    throw toChatError(err)
  }
  if (res.error && isAlreadyExists(res.error)) return
  unwrap(res)
}

export async function createAudioSignedUrl(path: string): Promise<string> {
  const sb = requireClient()
  const data = await call(() => sb.storage.from(CHAT_AUDIO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS))
  const url = isRecord(data) ? data.signedUrl : null
  if (typeof url !== 'string' || !url) throw new ChatError('unknown')
  return url
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup(name: string, memberPublicIds: number[], allowLeave: boolean): Promise<string> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('create_group', { p_name: name, p_member_public_ids: memberPublicIds, p_allow_leave: allowLeave }))
  if (!isUuid(data)) throw new ChatError('unknown')
  return data
}

export async function renameGroup(conversationId: string, name: string): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('rename_group', { p_conversation: conversationId, p_name: name }))
}

export async function setGroupArchived(conversationId: string, archived: boolean): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('set_group_archived', { p_conversation: conversationId, p_archived: archived }))
}

export async function deleteGroup(conversationId: string): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('delete_group', { p_conversation: conversationId }))
}

export async function addGroupMember(conversationId: string, publicId: number, asManager: boolean): Promise<string> {
  const sb = requireClient()
  const data = await call(() => sb.rpc('add_group_member', { p_conversation: conversationId, p_public_id: publicId, p_as_manager: asManager }))
  if (!isUuid(data)) throw new ChatError('unknown')
  return data
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('remove_group_member', { p_conversation: conversationId, p_user_id: userId }))
}

/** Promote ('manager' = group administrator) or demote ('member') a participant. */
export async function setGroupMemberRole(conversationId: string, userId: string, role: MemberRole): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('set_group_member_role', { p_conversation: conversationId, p_user_id: userId, p_role: role }))
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('leave_group', { p_conversation: conversationId }))
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function parseAdminUserRow(row: unknown): AdminUserRow | null {
  const profile = parsePublicProfile(row)
  if (!profile || !isRecord(row)) return null
  if (typeof row.can_manage_groups !== 'boolean') return null
  const monitor =
    isUuid(row.monitor_id) && row.monitor_public_id != null
      ? parsePublicProfile({ id: row.monitor_id, public_id: row.monitor_public_id, display_name: row.monitor_display_name, role: 'monitor' })
      : null
  return {
    ...profile,
    monitorStatus: row.monitor_status === 'pending' || row.monitor_status === 'verified' ? row.monitor_status : null,
    canManageGroups: row.can_manage_groups,
    monitor,
  }
}

export async function adminListUsers(search: string | null, limit = 100): Promise<AdminUserRow[]> {
  const sb = requireClient()
  const args: { p_search?: string; p_limit: number } = { p_limit: limit }
  if (search) args.p_search = search
  const data = await call(() => sb.rpc('admin_list_users', args))
  return parseList(data, parseAdminUserRow)
}

export async function adminVerifyMonitor(userId: string, verified: boolean): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('admin_verify_monitor', { p_user_id: userId, p_verified: verified }))
}

export async function adminSetRole(userId: string, role: Extract<UserRole, 'student' | 'monitor'>): Promise<void> {
  const sb = requireClient()
  await call(() => sb.rpc('admin_set_role', { p_user_id: userId, p_role: role }))
}

export async function adminSetStudentMonitor(studentPublicId: number, monitorPublicId: number | null): Promise<string | null> {
  const sb = requireClient()
  const args: { p_student_public_id: number; p_monitor_public_id?: number } = { p_student_public_id: studentPublicId }
  if (monitorPublicId !== null) args.p_monitor_public_id = monitorPublicId
  const data = await call(() => sb.rpc('admin_set_student_monitor', args))
  return isUuid(data) ? data : null
}
