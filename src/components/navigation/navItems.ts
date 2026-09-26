import { AudioLines, House, MessageCircle, Settings, UserRound, type LucideIcon } from 'lucide-react'
// Type-only import: keeps the paths in sync with the router at compile time without a runtime import cycle
// (router → AppLayout → navigation → router).
import type { ROUTES } from '@/app/router'

type AppRoutes = typeof ROUTES
type NavKey = 'home' | 'chat' | 'talk' | 'settings' | 'profile'

const PATHS = {
  home: '/',
  chat: '/chat',
  talk: '/talk',
  settings: '/settings',
  profile: '/profile',
} as const satisfies Pick<AppRoutes, NavKey>

export interface NavItem {
  key: NavKey
  to: string
  icon: LucideIcon
  /** Only active on an exact match (Início). */
  end?: boolean
  /** Conversar: gradient centre button. */
  center?: boolean
  /** Shows the chat unread counter. */
  unreadBadge?: boolean
}

/** The in-person translator (/translate) left the nav for Chat; it stays reachable from Início. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', to: PATHS.home, icon: House, end: true },
  { key: 'chat', to: PATHS.chat, icon: MessageCircle, unreadBadge: true },
  { key: 'talk', to: PATHS.talk, icon: AudioLines, center: true },
  { key: 'settings', to: PATHS.settings, icon: Settings },
  { key: 'profile', to: PATHS.profile, icon: UserRound },
]
