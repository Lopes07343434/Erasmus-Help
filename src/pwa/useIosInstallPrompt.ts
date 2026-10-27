import { useCallback, useEffect, useState } from 'react'
import { useInstallPrompt } from './useInstallPrompt'

/**
 * Automatic "Add to Home Screen" guide for iPhone/iPad.
 *
 * Safari never fires `beforeinstallprompt` and exposes no API to install a web app, so the closest thing to an
 * install prompt is a sheet that opens by itself and walks through Share → "Add to Home Screen". It is offered
 * only in the browser (never in the installed app) and, once dismissed, stays away for DISMISS_DAYS.
 */

const STORAGE_KEY = 'eh:ios-install-dismissed'
const DISMISS_DAYS = 7
/** Lets the first paint / splash settle before a sheet covers the page. */
const SHOW_DELAY_MS = 2500

const DAY_MS = 24 * 60 * 60 * 1000

export function wasDismissedRecently(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return false
    const at = Number(raw)
    return Number.isFinite(at) && at <= now && now - at < DISMISS_DAYS * DAY_MS
  } catch {
    return false
  }
}

function rememberDismissal(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now))
  } catch {
    // Storage unavailable (private mode / blocked): the sheet may come back on the next visit.
  }
}

export interface UseIosInstallPromptResult {
  readonly open: boolean
  readonly dismiss: () => void
}

export function useIosInstallPrompt(): UseIosInstallPromptResult {
  const { platform, installed } = useInstallPrompt()
  const eligible = platform === 'ios' && !installed
  const [armed, setArmed] = useState(false)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (!eligible || wasDismissedRecently()) return
    const timer = window.setTimeout(() => setArmed(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [eligible])

  const dismiss = useCallback(() => {
    rememberDismissal()
    setClosed(true)
  }, [])

  return { open: eligible && armed && !closed, dismiss }
}
