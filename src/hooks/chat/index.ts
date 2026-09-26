/**
 * Chat data-layer hooks. Signatures are fixed by src/services/chat/api.ts (Tech Lead contract).
 *
 * Any of these hooks bootstraps the chat session once for the whole app (anonymous sign-in after the
 * local onboarding + profile sync + one Realtime channel). `signOutChat()` must be called by
 * "Apagar dados deste dispositivo" (it is re-exported here for convenience).
 */
export { useChatSession } from './useChatSession'
export { useConversations } from './useConversations'
export { useConversation } from './useConversation'
export { useUnreadCounts } from './useUnreadCounts'
export { useChatNotifications } from './useChatNotifications'
export { useGroupActions, useStudentAssociation } from './useGroupActions'
export { useAdminUsers } from './useAdminUsers'
export { signOutChat } from '@/services/chat/session'
export { ChatError, getChatErrorDetail, type ChatErrorDetail } from '@/services/chat/errors'
