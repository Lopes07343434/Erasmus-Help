/**
 * In-app notices for incoming messages (toast/banner, and system notifications while the app is hidden). Built from
 * a Realtime message: never for my own messages, never for the conversation that is open on screen (it is notified
 * when the page is hidden), never for conversations I am not a member of (admins receive every message through Realtime).
 */
import type { IncomingMessageNotice } from './api'
import { useChatStore } from './chatStore'
import { previewOf } from './mappers'
import { getProfile, refreshConversations } from './threads'
import type { ChatMessage, ConversationSummary } from './types'

const get = useChatStore.getState

const pageHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'

function isSuppressed(msg: ChatMessage, activeConversationId: string | null): boolean {
  const s = get()
  const me = s.session.userId
  if (!me || msg.senderId === me) return true
  // The open conversation needs no notice while it is on screen — but it does in a background tab (system notification).
  if (pageHidden()) return false
  return msg.conversationId === activeConversationId || msg.conversationId === s.activeConversationId
}

export async function buildIncomingNotice(msg: ChatMessage, activeConversationId: string | null): Promise<IncomingMessageNotice | null> {
  if (isSuppressed(msg, activeConversationId)) return null
  let conv: ConversationSummary | undefined = get().list.byId[msg.conversationId]
  if (!conv) {
    if (get().session.me?.role === 'admin') return null
    // A conversation created a moment ago (added to a group / new monitor): load the list once.
    await refreshConversations()
    conv = get().list.byId[msg.conversationId]
    if (!conv) return null
  }
  const s = get()
  let senderName =
    s.profiles[msg.senderId]?.displayName ??
    (conv.otherUser?.id === msg.senderId ? conv.otherUser.displayName : undefined) ??
    s.members[msg.conversationId]?.items.find((m) => m.id === msg.senderId)?.displayName
  if (senderName === undefined) senderName = (await getProfile(msg.senderId))?.displayName
  senderName ??= conv.lastMessage?.senderId === msg.senderId ? (conv.lastMessage.senderName ?? '') : ''
  return {
    conversationId: msg.conversationId,
    kind: conv.kind,
    title: conv.kind === 'group' ? (conv.name ?? '') : senderName || (conv.otherUser?.displayName ?? ''),
    senderName,
    preview: msg.kind === 'text' ? previewOf(msg.body) : null,
    audioDurationMs: msg.kind === 'audio' ? msg.audioDurationMs : null,
  }
}

export { isSuppressed as isNoticeSuppressed }
