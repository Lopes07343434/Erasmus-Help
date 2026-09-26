/**
 * Public entry of the chat data layer for non-hook callers (e.g. the profile page's
 * "Apagar dados deste dispositivo" → `await signOutChat()`).
 * UI code should use the hooks in `@/hooks/chat`.
 */
export { signOutChat } from './session'
export { ChatError, getChatErrorDetail, toChatError, type ChatErrorDetail } from './errors'
export { formatPublicId, formatPublicIdNumber, isPublicIdQuery, parsePublicId } from './types'
export { avatarUrl } from './avatars'
