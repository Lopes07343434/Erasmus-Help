// Test-only fixtures and a controllable mock of `@/hooks/chat` (never imported by app code).
// Usage in a test file:
//   vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
//   import { chatMock, … } from '@/pages/chat/testFixtures'
import { useSyncExternalStore } from 'react'
import { vi } from 'vitest'
import type {
  AdminUsersState,
  ChatSession,
  ConversationState,
  ConversationsState,
  GroupActions,
  IncomingMessageNotice,
  StudentAssociation,
  UnreadCounts,
} from '@/services/chat/api'
import type { ChatMessage, ConversationKind, ConversationSummary, GroupMember, MyProfile, PublicProfile } from '@/services/chat/types'

// ── fixtures ────────────────────────────────────────────────────────────────

export const T0 = '2026-09-26T10:00:00.000Z'

export function makeMe(patch: Partial<MyProfile> = {}): MyProfile {
  return {
    id: 'u-me',
    publicId: 7,
    displayName: 'Rita Sousa',
    role: 'student',
    monitorStatus: null,
    canManageGroups: false,
    myLanguage: 'pt-PT',
    appLanguage: 'pt-PT',
    countryCode: 'IT',
    city: 'Milano',
    createdAt: T0,
    updatedAt: T0,
    ...patch,
  }
}

export const person = (id: string, publicId: number, displayName: string, role: PublicProfile['role']): PublicProfile => ({ id, publicId, displayName, role })

export const MONITOR = person('u-mon', 3, 'João Pereira', 'monitor')
export const STUDENT_ANA = person('u-ana', 12, 'Ana Costa', 'student')

export function makeDirect(patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c-direct',
    kind: 'direct',
    name: null,
    allowLeave: false,
    archivedAt: null,
    myRole: 'member',
    membersCount: 2,
    otherUser: MONITOR,
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: T0,
    ...patch,
  }
}

export function makeGroup(patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c-group',
    kind: 'group',
    name: 'Erasmus Milão',
    allowLeave: true,
    archivedAt: null,
    myRole: 'member',
    membersCount: 3,
    otherUser: null,
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: T0,
    ...patch,
  }
}

export function textMessage(id: string, senderId: string, body: string, createdAt: string, patch: Partial<ChatMessage> = {}): ChatMessage {
  return { id, conversationId: 'c-group', senderId, createdAt, status: 'sent', kind: 'text', body, ...patch } as ChatMessage
}

export function member(profile: PublicProfile, memberRole: GroupMember['memberRole'] = 'member'): GroupMember {
  return { ...profile, memberRole, joinedAt: T0, lastReadAt: T0 }
}

// ── controllable hooks mock ─────────────────────────────────────────────────

export interface ChatMockState {
  session: ChatSession
  lists: Record<ConversationKind, ConversationsState>
  conversation: ConversationState
  unread: UnreadCounts
  admin: AdminUsersState
}

export const readySession = (me: MyProfile): ChatSession => ({ status: 'ready', me, error: null, retry: vi.fn() })

export const listState = (items: ConversationSummary[], patch: Partial<ConversationsState> = {}): ConversationsState => ({
  status: 'success',
  items,
  error: null,
  refresh: vi.fn(),
  ...patch,
})

export function conversationState(patch: Partial<ConversationState> = {}): ConversationState {
  return {
    status: 'success',
    conversation: makeDirect(),
    members: [],
    messages: [],
    senders: {},
    hasOlder: false,
    loadingOlder: false,
    loadOlder: vi.fn(() => Promise.resolve()),
    sendText: vi.fn(() => Promise.resolve()),
    sendAudio: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
    discard: vi.fn(),
    markRead: vi.fn(),
    getAudioUrl: vi.fn(() => Promise.resolve('https://example.test/audio.webm')),
    error: null,
    ...patch,
  }
}

export const adminState = (patch: Partial<AdminUsersState> = {}): AdminUsersState => ({
  status: 'success',
  items: [],
  error: null,
  search: vi.fn(),
  verifyMonitor: vi.fn(() => Promise.resolve()),
  setCanManageGroups: vi.fn(() => Promise.resolve()),
  setRole: vi.fn(() => Promise.resolve()),
  setStudentMonitor: vi.fn(() => Promise.resolve()),
  ...patch,
})

function initialState(): ChatMockState {
  return {
    session: { status: 'not-configured', me: null, error: null, retry: vi.fn() },
    lists: { direct: listState([]), group: listState([]) },
    conversation: conversationState(),
    unread: { total: 0, direct: 0, groups: 0 },
    admin: adminState(),
  }
}

let state = initialState()
const listeners = new Set<() => void>()

export const groupActions = {
  createGroup: vi.fn((_input: { name: string; memberPublicIds: number[]; allowLeave?: boolean }) => Promise.resolve('c-new')),
  renameGroup: vi.fn((_id: string, _name: string) => Promise.resolve()),
  setArchived: vi.fn((_id: string, _archived: boolean) => Promise.resolve()),
  deleteGroup: vi.fn((_id: string) => Promise.resolve()),
  addMember: vi.fn((_id: string, _publicId: number, _asManager?: boolean) => Promise.resolve()),
  removeMember: vi.fn((_id: string, _userId: string) => Promise.resolve()),
  leaveGroup: vi.fn((_id: string) => Promise.resolve()),
  lookupByPublicId: vi.fn((_publicId: number) => Promise.resolve(STUDENT_ANA)),
} satisfies GroupActions

export const studentAssociation = {
  associateStudent: vi.fn((_publicId: number) => Promise.resolve('c-new')),
  removeAssociation: vi.fn((_studentId: string) => Promise.resolve()),
  lookupStudent: vi.fn((_publicId: number) => Promise.resolve(STUDENT_ANA)),
} satisfies StudentAssociation

/** Last `onNotice` given to useChatNotifications, and the active conversation it was given. */
export const notifications = {
  onNotice: null as ((notice: IncomingMessageNotice) => void) | null,
  activeConversationId: null as string | null,
}

export const chatMock = {
  get: () => state,
  set(patch: Partial<ChatMockState>) {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  },
  reset() {
    state = initialState()
    notifications.onNotice = null
    notifications.activeConversationId = null
    for (const fn of [...Object.values(groupActions), ...Object.values(studentAssociation)]) fn.mockClear()
  },
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const useMockState = () => useSyncExternalStore(subscribe, chatMock.get)

export const chatHooksMock = {
  useChatSession: () => useMockState().session,
  useConversations: (kind: ConversationKind) => useMockState().lists[kind],
  useConversation: () => useMockState().conversation,
  useUnreadCounts: () => useMockState().unread,
  useChatNotifications: (onNotice: (notice: IncomingMessageNotice) => void, activeConversationId: string | null) => {
    notifications.onNotice = onNotice
    notifications.activeConversationId = activeConversationId
  },
  useGroupActions: () => groupActions,
  useStudentAssociation: () => studentAssociation,
  useAdminUsers: () => useMockState().admin,
  signOutChat: vi.fn(() => Promise.resolve()),
}
