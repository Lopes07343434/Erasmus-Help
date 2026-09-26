/**
 * Row → domain mapping and input validation for the chat. Everything coming from Supabase
 * (PostgREST, RPC, Realtime payloads) is treated as `unknown` and validated here: an invalid row
 * yields `null` (skipped) instead of corrupting the store.
 */
import { isLanguageCode, isUiLocale } from '@/i18n/languages'
import { isRecord } from '@/services/http'
import { ChatError } from './errors'
import {
  CHAT_AUDIO_MIME_TYPES,
  CHAT_LIMITS,
  type ChatAudioMimeType,
  type ChatMessage,
  type ConversationKind,
  type ConversationSummary,
  type GroupMember,
  type LastMessagePreview,
  type MemberRole,
  type MonitorStatus,
  type MyProfile,
  type PersonSearchResult,
  type PublicProfile,
  type UserRole,
  isPublicIdQuery,
} from './types'

// ---------------------------------------------------------------------------
// Primitive readers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null)
const positiveInt = (v: unknown): number | null => {
  const n = int(v)
  return n !== null && n >= 1 ? n : null
}
/** bigint columns may arrive as numbers (PostgREST/jsonb) or numeric strings (Realtime). */
const publicIdOf = (v: unknown): number | null => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? positiveInt(Number(v)) : positiveInt(v))
const timestamp = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(toMicros(v)) ? v : null)

const USER_ROLES: readonly UserRole[] = ['student', 'monitor', 'admin']
const isUserRole = (v: unknown): v is UserRole => typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v)
const isMemberRole = (v: unknown): v is MemberRole => v === 'member' || v === 'manager'
const isMonitorStatus = (v: unknown): v is MonitorStatus => v === 'pending' || v === 'verified'
const isKind = (v: unknown): v is ConversationKind => v === 'direct' || v === 'group'
export const isChatAudioMime = (v: unknown): v is ChatAudioMimeType => typeof v === 'string' && (CHAT_AUDIO_MIME_TYPES as readonly string[]).includes(v)

/** Photo object path of a person (`users/{id}/…`) or a group (`groups/{id}/…`) — mirrors private.avatar_path_ok. */
export function avatarPathOf(scope: 'users' | 'groups', ownerId: string, v: unknown): string | null {
  if (typeof v !== 'string' || !isUuid(ownerId)) return null
  const re = /^(users|groups)\/([0-9a-f-]{36})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/
  const m = re.exec(v)
  return m && m[1] === scope && m[2] === ownerId ? v : null
}

// ---------------------------------------------------------------------------
// Timestamps (Postgres timestamptz keeps microseconds: compare with full precision)
// ---------------------------------------------------------------------------

const TS_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i

/** ISO/Postgres timestamp → microseconds since epoch (NaN when unparseable). No timezone = UTC. */
export function toMicros(ts: string): number {
  const m = TS_RE.exec(ts)
  if (!m) return Number.NaN
  const [, date, time, frac = '', rawTz] = m
  let tz = rawTz ? rawTz.toUpperCase() : 'Z'
  if (tz !== 'Z') {
    const digits = tz.slice(1).replace(':', '')
    tz = `${tz[0]}${digits.slice(0, 2)}:${digits.slice(2, 4) || '00'}`
  }
  const seconds = Date.parse(`${date}T${time}${tz}`)
  if (!Number.isFinite(seconds)) return Number.NaN
  return seconds * 1000 + Number((frac + '000000').slice(0, 6))
}

/** Negative when a < b. */
export function compareTimestamps(a: string, b: string): number {
  return toMicros(a) - toMicros(b)
}

/** Chronological order used everywhere (server order: created_at, then id). */
export function compareMessages(a: Pick<ChatMessage, 'createdAt' | 'id'>, b: Pick<ChatMessage, 'createdAt' | 'id'>): number {
  const d = compareTimestamps(a.createdAt, b.createdAt)
  if (d !== 0) return d
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// ---------------------------------------------------------------------------
// Text helpers (mirror private.clean_text / the list preview in SQL)
// ---------------------------------------------------------------------------

/** Characters PostgreSQL counts (code points), not UTF-16 units. */
export const codePointLength = (s: string): number => [...s].length

// eslint-disable-next-line no-control-regex
const INVISIBLE_RE = /[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g

/** Single-line label as the server stores it: NFC, whitespace → single space, invisible chars removed, trimmed. */
export function cleanLine(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\t\n\r\f\v\u00A0\u2028\u2029]/g, ' ')
    .replace(INVISIBLE_RE, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** One-line preview of a text message (≤ 120 chars), like list_my_conversations. */
export function previewOf(body: string): string {
  return [...body.replace(/\s+/g, ' ')].slice(0, CHAT_LIMITS.previewMaxLength).join('')
}

/** What search_profiles would search for (cleaned, ≤ 60 chars), or null when there is nothing to search yet (empty, "0", a 1-letter name). */
export function searchableQuery(raw: string): string | null {
  const q = [...cleanLine(typeof raw === 'string' ? raw : '')].slice(0, CHAT_LIMITS.searchMaxLength).join('').trim()
  if (!q) return null
  if (isPublicIdQuery(q)) return /[1-9]/.test(q) ? q : null
  return codePointLength(q) >= CHAT_LIMITS.searchMinNameLength ? q : null
}

// ---------------------------------------------------------------------------
// Input validation (throws ChatError('invalid-input'))
// ---------------------------------------------------------------------------

/** Message text: trimmed (like the server trigger), 1..4000 characters. */
export function validateMessageText(raw: string): string {
  const body = typeof raw === 'string' ? raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') : ''
  const len = codePointLength(body)
  if (len < 1 || len > CHAT_LIMITS.textMaxLength || body.trim().length === 0) throw new ChatError('invalid-input', 'invalid_input')
  return body
}

export function validateGroupName(raw: string): string {
  const name = typeof raw === 'string' ? cleanLine(raw) : ''
  const len = codePointLength(name)
  if (len < 1 || len > CHAT_LIMITS.groupNameMaxLength) throw new ChatError('invalid-input', 'invalid_input')
  return name
}

export function validatePublicId(n: unknown): number {
  const id = positiveInt(n)
  if (id === null) throw new ChatError('invalid-input', 'invalid_input')
  return id
}

export function validateUuid(v: unknown): string {
  if (!isUuid(v)) throw new ChatError('invalid-input', 'invalid_input')
  return v
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

/** { id, public_id, display_name, role, avatar_path? } (lookup/search RPCs, profiles select, list other_user). A malformed photo path is dropped, not the person. */
export function parsePublicProfile(row: unknown, idKey = 'id'): PublicProfile | null {
  if (!isRecord(row)) return null
  const id = row[idKey]
  const publicId = publicIdOf(row.public_id)
  const displayName = nonEmpty(row.display_name)
  if (!isUuid(id) || publicId === null || displayName === null || !isUserRole(row.role)) return null
  return { id, publicId, displayName, role: row.role, avatarPath: avatarPathOf('users', id, row.avatar_path) }
}

/** One row of rpc search_profiles. */
export function parsePersonSearchRow(row: unknown): PersonSearchResult | null {
  const profile = parsePublicProfile(row)
  if (!profile || !isRecord(row)) return null
  return { ...profile, exactIdMatch: row.exact_id_match === true }
}

/** Full own profile (get_my_profile / upsert_my_profile). */
export function parseMyProfile(row: unknown): MyProfile | null {
  const base = parsePublicProfile(row)
  if (!base || !isRecord(row)) return null
  const createdAt = timestamp(row.created_at)
  const updatedAt = timestamp(row.updated_at)
  const canManageGroups = bool(row.can_manage_groups)
  if (createdAt === null || updatedAt === null || canManageGroups === null) return null
  return {
    ...base,
    monitorStatus: isMonitorStatus(row.monitor_status) ? row.monitor_status : null,
    canManageGroups,
    myLanguage: isLanguageCode(row.my_language) ? row.my_language : null,
    appLanguage: isUiLocale(row.app_language) ? row.app_language : null,
    countryCode: typeof row.country_code === 'string' && /^[A-Z]{2}$/.test(row.country_code) ? row.country_code : null,
    city: nonEmpty(row.city),
    createdAt,
    updatedAt,
  }
}

function parseLastMessage(v: unknown): LastMessagePreview | null {
  if (!isRecord(v)) return null
  const id = v.id
  const senderId = v.sender_id
  const createdAt = timestamp(v.created_at)
  if (!isUuid(id) || !isUuid(senderId) || createdAt === null || (v.kind !== 'text' && v.kind !== 'audio')) return null
  return {
    id,
    kind: v.kind,
    preview: v.kind === 'text' ? str(v.preview) : null,
    audioDurationMs: v.kind === 'audio' ? positiveInt(v.audio_duration_ms) : null,
    senderId,
    senderName: nonEmpty(v.sender_name),
    createdAt,
  }
}

/** One row of rpc list_my_conversations. */
export function parseConversationRow(row: unknown): ConversationSummary | null {
  if (!isRecord(row)) return null
  const id = row.id
  const allowLeave = bool(row.allow_leave)
  const membersCount = int(row.members_count)
  const unread = int(row.unread_count)
  const createdAt = timestamp(row.created_at)
  if (!isUuid(id) || !isKind(row.kind) || allowLeave === null || !isMemberRole(row.my_role) || membersCount === null || unread === null || createdAt === null) return null
  const archivedAt = row.archived_at == null ? null : timestamp(row.archived_at)
  const lastMessageAt = row.last_message_at == null ? null : timestamp(row.last_message_at)
  if ((row.archived_at != null && archivedAt === null) || (row.last_message_at != null && lastMessageAt === null)) return null
  const name = row.kind === 'group' ? nonEmpty(row.name) : null
  if (row.kind === 'group' && name === null) return null
  return {
    id,
    kind: row.kind,
    name,
    avatarPath: row.kind === 'group' ? avatarPathOf('groups', id, row.avatar_path) : null,
    allowLeave,
    archivedAt,
    myRole: row.my_role,
    membersCount: Math.max(0, membersCount),
    otherUser: row.kind === 'direct' ? parsePublicProfile(row.other_user) : null,
    lastMessage: parseLastMessage(row.last_message),
    unreadCount: Math.min(Math.max(0, unread), CHAT_LIMITS.unreadCap),
    lastMessageAt,
    createdAt,
  }
}

/** One row of public.messages (select or Realtime INSERT payload). Status is 'sent' (it exists server-side). */
export function parseMessageRow(row: unknown): ChatMessage | null {
  if (!isRecord(row)) return null
  const id = row.id
  const conversationId = row.conversation_id
  const senderId = row.sender_id
  const createdAt = timestamp(row.created_at)
  if (!isUuid(id) || !isUuid(conversationId) || !isUuid(senderId) || createdAt === null) return null
  const base = { id, conversationId, senderId, createdAt, status: 'sent' as const }
  if (row.kind === 'text') {
    const body = str(row.body)
    return body === null ? null : { ...base, kind: 'text', body }
  }
  if (row.kind === 'audio') {
    const audioPath = nonEmpty(row.audio_path)
    const audioDurationMs = positiveInt(row.audio_duration_ms)
    if (audioPath === null || audioDurationMs === null || !isChatAudioMime(row.audio_mime) || !audioPath.startsWith(`${conversationId}/`)) return null
    return { ...base, kind: 'audio', audioPath, audioDurationMs, audioMime: row.audio_mime }
  }
  return null
}

/** One row of rpc list_conversation_members. */
export function parseMemberRow(row: unknown): GroupMember | null {
  const profile = parsePublicProfile(row, 'user_id')
  if (!profile || !isRecord(row)) return null
  const joinedAt = timestamp(row.joined_at)
  const lastReadAt = timestamp(row.last_read_at)
  if (!isMemberRole(row.member_role) || joinedAt === null || lastReadAt === null) return null
  return { ...profile, memberRole: row.member_role, joinedAt, lastReadAt }
}

/** conversation_members row from Realtime (no profile fields). */
export interface MembershipRow {
  conversationId: string
  userId: string
  memberRole: MemberRole | null
  lastReadAt: string | null
  joinedAt: string | null
}

export function parseMembershipRow(row: unknown): MembershipRow | null {
  if (!isRecord(row)) return null
  const conversationId = row.conversation_id
  const userId = row.user_id
  if (!isUuid(conversationId) || !isUuid(userId)) return null
  return {
    conversationId,
    userId,
    memberRole: isMemberRole(row.member_role) ? row.member_role : null,
    lastReadAt: timestamp(row.last_read_at),
    joinedAt: timestamp(row.joined_at),
  }
}

/** conversations row from Realtime UPDATE. */
export interface ConversationRowUpdate {
  id: string
  name: string | null
  allowLeave: boolean | null
  archivedAt: string | null
  lastMessageAt: string | null
  /** undefined when the payload has no avatar_path column (older schema); null = no photo. */
  avatarPath: string | null | undefined
}

export function parseConversationUpdate(row: unknown): ConversationRowUpdate | null {
  if (!isRecord(row) || !isUuid(row.id)) return null
  return {
    id: row.id,
    name: nonEmpty(row.name),
    allowLeave: bool(row.allow_leave),
    archivedAt: row.archived_at == null ? null : timestamp(row.archived_at),
    lastMessageAt: row.last_message_at == null ? null : timestamp(row.last_message_at),
    avatarPath: 'avatar_path' in row ? avatarPathOf('groups', row.id, row.avatar_path) : undefined,
  }
}

/** Last-message preview built locally from a new message (Realtime) — mirrors the SQL one. */
export function lastMessageFromMessage(msg: ChatMessage, senderName: string | null): LastMessagePreview {
  return {
    id: msg.id,
    kind: msg.kind,
    preview: msg.kind === 'text' ? previewOf(msg.body) : null,
    audioDurationMs: msg.kind === 'audio' ? msg.audioDurationMs : null,
    senderId: msg.senderId,
    senderName,
    createdAt: msg.createdAt,
  }
}
