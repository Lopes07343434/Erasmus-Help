import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useSearchParams } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { PageFallback } from '@/components/feedback/PageFallback'
import { RouteError } from '@/components/feedback/RouteError'
import { selectIsOnboarded, useProfileStore } from '@/stores/profileStore'

const OnboardingPage = lazy(() => import('@/pages/onboarding/OnboardingPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const TranslatePage = lazy(() => import('@/pages/translate/TranslatePage'))
const TalkPage = lazy(() => import('@/pages/talk/TalkPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const ChatLayout = lazy(() => import('@/pages/chat/ChatLayout'))
const ConversationPage = lazy(() => import('@/pages/chat/ConversationPage'))
const AdminPage = lazy(() => import('@/pages/admin/AdminPage'))

export const ROUTES = {
  welcome: '/welcome',
  home: '/',
  /** In-person translator: no longer in the nav, still linked from Início. */
  translate: '/translate',
  chat: '/chat',
  talk: '/talk',
  settings: '/settings',
  profile: '/profile',
  /** Chat administration (linked from Definições for admins only). */
  admin: '/admin',
} as const

const page = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>

function RequireOnboarding({ children }: { children: ReactNode }) {
  const onboarded = useProfileStore(selectIsOnboarded)
  return onboarded ? children : <Navigate to={ROUTES.welcome} replace />
}

/** Onboarded users are sent home, except for `/welcome?intro=1` (replay the intro slides from Settings → Sobre). */
function OnboardingGate({ children }: { children: ReactNode }) {
  const onboarded = useProfileStore(selectIsOnboarded)
  const [params] = useSearchParams()
  const replayIntro = params.get('intro') === '1'
  return onboarded && !replayIntro ? <Navigate to={ROUTES.home} replace /> : children
}

export const router = createBrowserRouter([
  {
    path: ROUTES.welcome,
    errorElement: <RouteError />,
    element: <OnboardingGate>{page(<OnboardingPage />)}</OnboardingGate>,
  },
  {
    path: '/',
    errorElement: <RouteError />,
    element: (
      <RequireOnboarding>
        <AppLayout />
      </RequireOnboarding>
    ),
    children: [
      { index: true, element: page(<DashboardPage />) },
      { path: ROUTES.translate.slice(1), element: page(<TranslatePage />) },
      {
        // Renders the list itself (/chat); one screen at a time on mobile, list + conversation side by side from 1024px.
        path: ROUTES.chat.slice(1),
        element: page(<ChatLayout />),
        children: [{ path: ':conversationId', element: page(<ConversationPage />) }],
      },
      { path: ROUTES.talk.slice(1), element: page(<TalkPage />) },
      { path: ROUTES.settings.slice(1), element: page(<SettingsPage />) },
      { path: ROUTES.profile.slice(1), element: page(<ProfilePage />) },
      { path: ROUTES.admin.slice(1), element: page(<AdminPage />) },
    ],
  },
  { path: '*', element: <Navigate to={ROUTES.home} replace /> },
])
