import { lazy, Suspense } from 'react'

/**
 * The notices depend on `virtual:pwa-register` (via useServiceWorker). Loading them lazily keeps the
 * layout — and everything importing `@/app/router` (ROUTES) — free of that side effect, so modules that
 * only need route constants can be imported in tests. Registration starts as soon as the layout mounts.
 */
const PwaNotices = lazy(() => import('./PwaNotices'))

/** Global "update available" card + "offline ready" toast. Mount once, inside AppLayout's ToastProvider. */
export function PwaUpdatePrompt() {
  return (
    <Suspense fallback={null}>
      <PwaNotices />
    </Suspense>
  )
}
