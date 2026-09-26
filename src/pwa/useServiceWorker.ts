/// <reference types="vite-plugin-pwa/vanillajs" />
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker lifecycle as a tiny shared store.
 *
 * `useRegisterSW` (virtual:pwa-register/react) registers once PER hook instance, so two components using
 * it would register twice and get separate state. Here registration happens once (on first subscriber)
 * and every `useServiceWorker()` caller shares the same state — mount it in the layout for the global
 * "update available" / "offline ready" notice and reuse it anywhere else.
 *
 * In `npm run dev` the plugin serves a no-op `registerSW` (devOptions disabled): flags stay false.
 */

/** How often an open app checks the server for a new version (skipped while offline). */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export interface ServiceWorkerState {
  /** A new version is installed and waiting for the user's OK. */
  readonly needRefresh: boolean
  /** First install finished: the app shell is cached and opens offline. */
  readonly offlineReady: boolean
}

export interface UseServiceWorkerResult extends ServiceWorkerState {
  /** Activates the waiting version; the page reloads once it takes control. Call from a user action. */
  update: () => Promise<void>
  /** Hides the notice. A dismissed update is applied the next time every tab of the app is closed. */
  dismiss: () => void
}

let state: ServiceWorkerState = { needRefresh: false, offlineReady: false }
const listeners = new Set<() => void>()
let started = false
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null

function setState(patch: Partial<ServiceWorkerState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now()
  const check = () => {
    if (!navigator.onLine || registration.installing) return
    lastCheck = Date.now()
    // Network/server failures are expected here (flaky mobile data): just try again next time.
    registration.update().catch(() => undefined)
  }
  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  // Mobile browsers throttle timers in the background: also check when the app comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck >= UPDATE_CHECK_INTERVAL_MS) check()
  })
}

/** Registers the service worker once. Called at startup (main.tsx) so first-run users get the offline shell too. */
export function registerServiceWorker(): void {
  ensureRegistered()
}

function ensureRegistered(): void {
  if (started || typeof window === 'undefined') return
  started = true
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => setState({ needRefresh: true }),
    onOfflineReady: () => setState({ offlineReady: true }),
    onRegisteredSW: (_swUrl, registration) => {
      if (registration) watchForUpdates(registration)
    },
    onRegisterError: (error: unknown) => {
      if (import.meta.env.DEV) console.warn('[pwa] service worker registration failed', error)
    },
  })
}

function subscribe(listener: () => void): () => void {
  ensureRegistered()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): ServiceWorkerState => state

async function update(): Promise<void> {
  await applyUpdate?.(true)
}

function dismiss(): void {
  setState({ needRefresh: false, offlineReady: false })
}

export function useServiceWorker(): UseServiceWorkerResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...snapshot, update, dismiss }
}
