/**
 * Contract between the Chat data layer (hooks in src/hooks/chat) and the Chat UI (src/pages/chat).
 * Owned by the Tech Lead: change it only in coordination with both sides.
 */
import type { AppError } from '@/services/errors'
import type { RecordedAudio } from '@/services/audio'
import type { ChatMessage, ConversationKind, ConversationSummary, GroupMember, MyProfile, PublicProfile } from './types'

/** Overall availability of the chat backend for this device. */
export type ChatSessionStatus =
  | 'not-configured' // no VITE_SUPABASE_* → chat unavailable in this build
  | 'connecting' // signing in anonymously / syncing the profile
  | 'ready'
  | 'offline' // no network and no cached session data
  | 'error' // e.g. anonymous sign-ins disabled, rate limited

export interface ChatSession {
  status: ChatSessionStatus
  /** Signed-in user's profile (null until ready). */
  me: MyProfile | null
  error: AppError | null
  retry(): void
}

export type LoadStatus = 'loading' | 'success' | 'error'

export interface ConversationsState {
  status: LoadStatus
  /** Sorted by lastMessageAt desc (fallback createdAt). Realtime-updated (new messages, unread counts, membership). */
  items: ConversationSummary[]
  error: AppError | null
  refresh(): void
}

export interface ConversationState {
  status: LoadStatus | 'not-found'
  conversation: ConversationSummary | null
  /** Participants with read state (for groups list + read receipts). */
  members: GroupMember[]
  /** Chronological (oldest → newest). Includes optimistic 'sending'/'failed' messages. Realtime-updated. */
  messages: ChatMessage[]
  /** Profiles of every sender that appears in `messages` (incl. people who already left). */
  senders: Record<string, PublicProfile>
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder(): Promise<void>
  /** Validates (trim, 1..4000), optimistic insert, then persists. Throws AppError('invalid-input'|...) only for validation. */
  sendText(body: string): Promise<void>
  /** Uploads to storage (plain content type), then inserts the message. Optimistic 'sending' bubble meanwhile. */
  sendAudio(audio: RecordedAudio): Promise<void>
  /** Retries a failed message (text or audio). */
  retry(messageId: string): Promise<void>
  /** Discards a failed optimistic message. */
  discard(messageId: string): void
  /** Marks the conversation as read now (call when visible + focused, and on new incoming messages while visible). */
  markRead(): void
  /** Signed URL (≈5 min) for an audio message; cached. */
  getAudioUrl(audioPath: string): Promise<string>
  error: AppError | null
}

export interface UnreadCounts {
  total: number
  direct: number
  groups: number
}

/** In-app notification for an incoming message (toast/banner), emitted by useChatNotifications. */
export interface IncomingMessageNotice {
  conversationId: string
  kind: ConversationKind
  /** Group name, or the sender's name for direct chats. */
  title: string
  senderName: string
  preview: string | null
  audioDurationMs: number | null
}

export interface GroupActions {
  /** Creates a group; the caller becomes manager. Returns the conversation id. */
  createGroup(input: { name: string; memberPublicIds: number[]; allowLeave?: boolean }): Promise<string>
  renameGroup(conversationId: string, name: string): Promise<void>
  setArchived(conversationId: string, archived: boolean): Promise<void>
  /** Admin only (hard delete). */
  deleteGroup(conversationId: string): Promise<void>
  addMember(conversationId: string, publicId: number, asManager?: boolean): Promise<void>
  removeMember(conversationId: string, userId: string): Promise<void>
  leaveGroup(conversationId: string): Promise<void>
  /** Name/role preview before adding someone (throws not-found / not-allowed). */
  lookupByPublicId(publicId: number): Promise<PublicProfile>
}

export interface StudentAssociation {
  /** Verified monitor associates a student (creates the direct conversation). Returns its id. */
  associateStudent(studentPublicId: number): Promise<string>
  removeAssociation(studentId: string): Promise<void>
  lookupStudent(publicId: number): Promise<PublicProfile>
}

export interface AdminUserRow extends PublicProfile {
  monitorStatus: 'pending' | 'verified' | null
  canManageGroups: boolean
  /** For students: their monitor, if any. */
  monitor: PublicProfile | null
}

export interface AdminUsersState {
  status: LoadStatus
  items: AdminUserRow[]
  error: AppError | null
  search(query: string): void
  verifyMonitor(userId: string, verified: boolean): Promise<void>
  setCanManageGroups(userId: string, value: boolean): Promise<void>
  setRole(userId: string, role: 'student' | 'monitor'): Promise<void>
  setStudentMonitor(studentPublicId: number, monitorPublicId: number | null): Promise<void>
}

/** Maps chat RPC errors to AppError codes the UI can localize (errors.* / chat.errors.*). */
export type ChatErrorCode =
  | 'not_allowed'
  | 'not_found'
  | 'invalid_input'
  | 'already_associated'
  | 'already_member'
  | 'not_verified'
  | 'archived'
  | 'last_manager'
