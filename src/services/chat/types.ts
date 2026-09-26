/**
 * Chat domain types (app level, camelCase). The Supabase row/RPC shapes live in
 * `@/services/supabase/database.types`; a repository maps them to these types.
 *
 * Chat = messages between PEOPLE (students ↔ monitors, groups). Not the AI practice
 * and not the in-person translator.
 */
import type { LanguageCode, UiLocale } from '@/i18n/languages'

/** Chat role. Wider than the onboarding `UserRole` in `@/types/profile`: admins exist only server-side. */
export type UserRole = 'student' | 'monitor' | 'admin'
export type MonitorStatus = 'pending' | 'verified'
export type ConversationKind = 'direct' | 'group'
export type MemberRole = 'member' | 'manager'
export type MessageKind = 'text' | 'audio'

/**
 * Client-side delivery state (not stored in the DB):
 * sending → sent (row inserted) → read (every other member's lastReadAt ≥ createdAt); failed = insert/upload error.
 */
export type MessageStatus = 'sending' | 'sent' | 'read' | 'failed'

/** The only profile fields other users may see. */
export interface PublicProfile {
  id: string
  /** Automatic public number (1, 2, 3, … gap-free, never reused), shown with `formatPublicId` ("ID: 01"). Not a credential. */
  publicId: number
  displayName: string
  role: UserRole
  /** Photo: object path in the public bucket `avatars` (`users/{id}/{uuid}.jpg`), or null. URL: `avatarUrl()`. */
  avatarPath: string | null
}

/** One row of rpc search_profiles (people directory: by ID or by name). Never the signed-in user. */
export interface PersonSearchResult extends PublicProfile {
  /** The typed ID is exactly this person's ID ("07" → 7): listed first. */
  exactIdMatch: boolean
}

/** The signed-in user's full profile (rpc get_my_profile / upsert_my_profile). */
export interface MyProfile extends PublicProfile {
  /** Only for monitors: monitor powers require 'verified' (set by an admin). */
  monitorStatus: MonitorStatus | null
  canManageGroups: boolean
  myLanguage: LanguageCode | null
  appLanguage: UiLocale | null
  countryCode: string | null
  city: string | null
  createdAt: string
  updatedAt: string
}

export interface LastMessagePreview {
  id: string
  kind: MessageKind
  /** Text messages only: single line, ≤ 120 chars. */
  preview: string | null
  audioDurationMs: number | null
  senderId: string
  senderName: string | null
  createdAt: string
}

/** One row of rpc list_my_conversations. */
export interface ConversationSummary {
  id: string
  kind: ConversationKind
  /** Groups only. For direct chats use `otherUser.displayName`. */
  name: string | null
  /** Group photo (`groups/{id}/{uuid}.jpg` in bucket `avatars`). Direct chats: use `otherUser.avatarPath`. */
  avatarPath: string | null
  allowLeave: boolean
  archivedAt: string | null
  myRole: MemberRole
  membersCount: number
  /** Direct chats only. */
  otherUser: PublicProfile | null
  lastMessage: LastMessagePreview | null
  /** Capped at 100 by the server → render "99+" above 99. */
  unreadCount: number
  lastMessageAt: string | null
  createdAt: string
}

interface ChatMessageBase {
  /** Client-generated UUID (crypto.randomUUID()) so retries are idempotent. */
  id: string
  conversationId: string
  senderId: string
  /** Server time once sent; local time while `status === 'sending'`. */
  createdAt: string
  status: MessageStatus
}

export interface TextChatMessage extends ChatMessageBase {
  kind: 'text'
  body: string
}

export interface AudioChatMessage extends ChatMessageBase {
  kind: 'audio'
  /** Storage object path in bucket `chat-audio`: `{conversationId}/{uuid}.{ext}`. */
  audioPath: string
  audioDurationMs: number
  audioMime: ChatAudioMimeType
}

export type ChatMessage = TextChatMessage | AudioChatMessage

/** One row of rpc list_conversation_members (participant list + read receipts). */
export interface GroupMember extends PublicProfile {
  memberRole: MemberRole
  joinedAt: string
  lastReadAt: string
}

// ---------------------------------------------------------------------------
// Limits and constants (mirror the SQL constraints / bucket settings)
// ---------------------------------------------------------------------------

export const CHAT_LIMITS = {
  displayNameMaxLength: 40,
  groupNameMaxLength: 60,
  cityMaxLength: 80,
  textMaxLength: 4000,
  previewMaxLength: 120,
  audioMaxDurationMs: 300_000,
  audioMaxBytes: 5 * 1024 * 1024,
  groupCreateMaxMembers: 500,
  unreadCap: 100,
  /** People search: name queries need ≥ 2 characters; queries are capped at 60; ≤ 20 results. */
  searchMinNameLength: 2,
  searchMaxLength: 60,
  searchResultsLimit: 20,
  /** Photos are re-encoded client-side to a square JPEG of this size before upload. */
  avatarSizePx: 512,
  /** Bucket limit (the re-encoded JPEG is far smaller). */
  avatarMaxBytes: 2 * 1024 * 1024,
  /** Largest picture the user may pick (it is decoded and shrunk in the browser). */
  avatarSourceMaxBytes: 20 * 1024 * 1024,
} as const

export const CHAT_AUDIO_BUCKET = 'chat-audio'

/** Public bucket of profile / group photos (random object names; the bucket cannot be listed). */
export const CHAT_AVATAR_BUCKET = 'avatars'

/** Upload with one of these exact content types (no `;codecs=` parameter). */
export const CHAT_AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'] as const
export type ChatAudioMimeType = (typeof CHAT_AUDIO_MIME_TYPES)[number]

// ---------------------------------------------------------------------------
// RPC errors (raise exception '<code>' using errcode = 'P0001')
// ---------------------------------------------------------------------------

export const CHAT_RPC_ERRORS = [
  'not_authenticated',
  'not_allowed',
  'not_found',
  'invalid_input',
  'already_associated',
  'already_member',
  'not_verified',
  'archived',
  'last_manager',
] as const
export type ChatRpcError = (typeof CHAT_RPC_ERRORS)[number]

/** Extracts the chat error code from a PostgREST error ({ code: 'P0001', message: '<code>' }). */
export function parseChatRpcError(err: unknown): ChatRpcError | null {
  if (typeof err !== 'object' || err === null) return null
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (code !== undefined && code !== 'P0001') return null
  return typeof message === 'string' && (CHAT_RPC_ERRORS as readonly string[]).includes(message) ? (message as ChatRpcError) : null
}

// ---------------------------------------------------------------------------
// Public ID helpers
// ---------------------------------------------------------------------------

/** The number as shown: 1–9 → "01"–"09", from 10 on as is ("10", "99", "100", "101"). */
export function formatPublicIdNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`Invalid public id: ${n}`)
  return String(n).padStart(2, '0')
}

/** 1 → "ID: 01", 7 → "ID: 07", 15 → "ID: 15", 123 → "ID: 123". */
export function formatPublicId(n: number): string {
  return `ID: ${formatPublicIdNumber(n)}`
}

/** An ID as typed: "7", "07", "ID 07", "ID: 07", "id7", "#7" (leading zeros allowed). */
const PUBLIC_ID_INPUT_RE = /^\s*(?:id)?\s*[:#]?\s*(\d{1,15})\s*$/i

/** Parses what a user types to find someone: "ID: 01", "ID 01", "id7", "#7", " 07 " → 7. Anything else → null. */
export function parsePublicId(input: string): number | null {
  const match = PUBLIC_ID_INPUT_RE.exec(input)
  if (!match?.[1]) return null
  const n = Number(match[1])
  return Number.isSafeInteger(n) && n >= 1 ? n : null
}

/** True when the search text is an ID (digits, optionally "ID"/"#"/":"), as search_profiles decides server-side. */
export const isPublicIdQuery = (input: string): boolean => PUBLIC_ID_INPUT_RE.test(input)
