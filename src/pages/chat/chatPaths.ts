// Type-only import: keeps the paths in sync with the router at compile time without a runtime import cycle
// (router → AppLayout → chat notifications → router).
import type { ROUTES } from '@/app/router'

type AppRoutes = typeof ROUTES

export const CHAT_PATH = '/chat' as const satisfies AppRoutes['chat']
export const ADMIN_PATH = '/admin' as const satisfies AppRoutes['admin']
/** Route pattern of an open conversation (router + AppLayout's useMatch). */
export const CHAT_CONVERSATION_PATTERN = `${CHAT_PATH}/:conversationId`

export type ChatTab = 'conversas' | 'grupos'

/** `?tab=grupos` → groups; anything else → conversas (the default tab). */
export const parseChatTab = (value: string | null): ChatTab => (value === 'grupos' ? 'grupos' : 'conversas')

export const chatTabPath = (tab: ChatTab): string => (tab === 'conversas' ? CHAT_PATH : `${CHAT_PATH}?tab=${tab}`)

/**
 * An open conversation. `tab` keeps the list's tab in the URL (desktop split view: the list pane stays on "Grupos"
 * while a group is open); 'conversas' is the default and adds nothing.
 */
export const conversationPath = (conversationId: string, tab?: ChatTab): string =>
  `${CHAT_PATH}/${encodeURIComponent(conversationId)}${tab === 'grupos' ? '?tab=grupos' : ''}`

/** DOM ids of the Chat tabs / tab panels (ChatTabs + ChatPage). */
export const chatTabId = (baseId: string, value: string) => `${baseId}-tab-${value}`
export const chatPanelId = (baseId: string, value: string) => `${baseId}-panel-${value}`

/** DOM id of a message bubble (scroll anchoring when older messages are prepended). */
export const messageElementId = (messageId: string) => `msg-${messageId}`
