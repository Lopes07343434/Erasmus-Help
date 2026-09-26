import { lazy, Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation, useMatch } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { AppBackground } from '@/components/ui/AppBackground'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { cn } from '@/components/ui/cn'
import { BottomNav } from '@/components/navigation/BottomNav'
import { SideNav } from '@/components/navigation/SideNav'
import { OfflineBanner } from '@/components/feedback/OfflineBanner'
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt'
import { CHAT_CONVERSATION_PATTERN, CHAT_PATH } from '@/pages/chat/chatPaths'

// Lazy: it starts the chat session (supabase-js + realtime ≈70 KB gz) after the shell has painted.
const ChatNotificationsBridge = lazy(() => import('@/pages/chat/components/ChatNotificationsBridge').then((m) => ({ default: m.ChatNotificationsBridge })))

/**
 * Layout CSS variables (available to every page and to the toast):
 *  --eh-nav-h         bottom nav height incl. safe area (0 on desktop)
 *  --eh-sidebar-w     side nav width (248px on desktop, 0 on mobile)
 *  --eh-content-pt/pb top/bottom padding of the content column
 *  --eh-toast-bottom  toast offset (16px above the bottom nav; 32px on desktop)
 */
const LAYOUT_VARS = cn(
  '[--eh-sidebar-w:0px] lg:[--eh-sidebar-w:248px]',
  '[--eh-nav-h:calc(66px_+_max(12px,env(safe-area-inset-bottom)))] lg:[--eh-nav-h:0px]',
  '[--eh-toast-bottom:calc(var(--eh-nav-h)_+_16px)] lg:[--eh-toast-bottom:32px]',
  '[--eh-content-pt:calc(env(safe-area-inset-top)_+_16px)] lg:[--eh-content-pt:48px]',
  '[--eh-content-pb:calc(var(--eh-nav-h)_+_28px)] lg:[--eh-content-pb:64px]',
)

/**
 * App shell: fixed blob background, content column (px 20, max-w 640 centred), BottomNav < 1024px and
 * SideNav ≥ 1024px. Both navs are always rendered and toggled by CSS breakpoints (no JS media query → no
 * flicker on first paint, and the hidden one costs nothing: display:none skips its backdrop blur).
 * An open chat conversation is immersive: no bottom nav and no layout offline banner (the conversation has its own
 * sticky header/composer and shows the offline pill in its header).
 * Chat on desktop is a split view (list + conversation, see ChatLayout): a wider column, the offline pill moves into
 * the list pane, and the section is not re-keyed per path so the list stays mounted while conversations change.
 */
export function AppLayout() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const activeConversationId = useMatch(CHAT_CONVERSATION_PATTERN)?.params.conversationId ?? null
  const immersive = activeConversationId !== null
  const chatSection = useMatch({ path: CHAT_PATH, end: false }) !== null

  return (
    <div
      className={cn(
        LAYOUT_VARS,
        // Immersive chat: no nav, so lift toasts / update card above the composer instead.
        immersive && '[--eh-toast-bottom:calc(88px_+_env(safe-area-inset-bottom))] lg:[--eh-toast-bottom:104px]',
        'relative min-h-dvh overflow-x-clip text-text',
      )}
    >
      <ToastProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-(--z-critical) focus:rounded-control focus:bg-surface-solid focus:px-4 focus:py-3 focus:font-semibold focus:text-primary focus:shadow-glass"
        >
          {t('common.a11y.skipToContent')}
        </a>
        <AppBackground />
        <SideNav />
        <div className="relative z-(--z-content) lg:pl-(--eh-sidebar-w)">
          <main
            id="main"
            tabIndex={-1}
            className={cn('mx-auto w-full max-w-[640px] px-5 pt-(--eh-content-pt) pb-(--eh-content-pb) outline-none lg:px-10', chatSection && 'lg:max-w-[1200px]')}
          >
            {immersive ? null : <OfflineBanner className={chatSection ? 'lg:hidden' : undefined} />}
            {/* Keyed by pathname: subtle fade on route change (search-param changes don't re-animate). The chat
                section keeps one key and fades its own screens / panes (ChatLayout). */}
            <div key={chatSection ? CHAT_PATH : pathname} className={chatSection ? undefined : 'animate-eh-fade'}>
              <Outlet />
            </div>
          </main>
        </div>
        {immersive ? null : <BottomNav />}
        <Suspense fallback={null}>
          <ChatNotificationsBridge activeConversationId={activeConversationId} />
        </Suspense>
        <PwaUpdatePrompt />
      </ToastProvider>
      <ScrollRestoration />
    </div>
  )
}
