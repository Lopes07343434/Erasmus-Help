import { useSyncExternalStore } from 'react'

/**
 * Install ("Add to Home Screen") state.
 *
 * `beforeinstallprompt` (Chromium only) can fire right after load, before the page that offers
 * installation is mounted, so it is captured at module load. Importing anything from `@/pwa` (e.g. the
 * layout's `useServiceWorker`) is enough to start listening.
 *
 * iOS/iPadOS never fire it: show the manual steps (`platform === 'ios' && !isStandalone`).
 */

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'
export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other'

export interface UseInstallPromptResult {
  /** The browser offered a native install prompt that has not been used yet. */
  readonly canInstall: boolean
  /** Running as the installed app (display-mode standalone, or iOS home-screen app). */
  readonly isStandalone: boolean
  /** Standalone now, or installed during this session (`appinstalled`). */
  readonly installed: boolean
  /** Coarse platform hint to pick manual install / settings instructions. */
  readonly platform: InstallPlatform
  /** Shows the native prompt. Must be called from a user gesture; the prompt can be used only once. */
  promptInstall: () => Promise<InstallOutcome>
}

/** Chromium's install event (not part of lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

interface InstallState {
  readonly deferred: BeforeInstallPromptEvent | null
  readonly standalone: boolean
  readonly installed: boolean
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event
}

export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  // iPadOS 13+ reports a Mac user agent; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mobi|Tablet|KAIOS/i.test(userAgent)) return 'other'
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return 'desktop'
  return 'other'
}

const hasDom = typeof window !== 'undefined' && typeof navigator !== 'undefined'
const standaloneQuery =
  hasDom && typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null
const platform: InstallPlatform = hasDom ? detectPlatform(navigator.userAgent, navigator.maxTouchPoints) : 'other'

function readStandalone(): boolean {
  if (!hasDom) return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || standaloneQuery?.matches === true
}

let state: InstallState = { deferred: null, standalone: readStandalone(), installed: false }
const listeners = new Set<() => void>()

function setState(patch: Partial<InstallState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

if (hasDom) {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isBeforeInstallPromptEvent(event)) return
    // Suppress Chrome's automatic mini-infobar: the app offers installation in its own UI.
    event.preventDefault()
    setState({ deferred: event })
  })
  window.addEventListener('appinstalled', () => setState({ deferred: null, installed: true }))
  // Desktop Chromium can move the same document into an app window ("Open in app").
  standaloneQuery?.addEventListener('change', () => setState({ standalone: readStandalone() }))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): InstallState => state

async function promptInstall(): Promise<InstallOutcome> {
  const event = state.deferred
  if (!event) return 'unavailable'
  setState({ deferred: null })
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'unavailable'
  }
}

export function useInstallPrompt(): UseInstallPromptResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    canInstall: snapshot.deferred !== null,
    isStandalone: snapshot.standalone,
    installed: snapshot.standalone || snapshot.installed,
    platform,
    promptInstall,
  }
}
