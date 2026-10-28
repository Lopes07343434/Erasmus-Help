import { useCallback, useEffect, useState } from 'react'
import { toAppError } from '@/services/errors'
import { getMicrophonePermission, requestMicrophonePermission, type MicrophonePermission } from '@/services/speech'

export interface UseMicrophonePermissionResult {
  /** Real browser state; null until it was read. 'prompt' = the browser has not been asked yet. */
  readonly permission: MicrophonePermission | null
  readonly requesting: boolean
  /** True when the last request failed for a reason other than a refusal (no microphone, busy…). */
  readonly failed: boolean
  /** Opens the real browser prompt. Call it directly from a tap. */
  request: () => Promise<void>
}

/** Microphone permission for the permissions screen: reads the real state, follows changes made in the browser/OS settings. */
export function useMicrophonePermission(): UseMicrophonePermissionResult {
  const [permission, setPermission] = useState<MicrophonePermission | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let status: PermissionStatus | null = null
    const refresh = () => {
      void getMicrophonePermission().then((value) => {
        if (!cancelled) setPermission(value)
      })
    }
    refresh()
    if (typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          if (cancelled) return
          status = result
          result.addEventListener('change', refresh)
        })
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      status?.removeEventListener('change', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const request = useCallback(async () => {
    setRequesting(true)
    setFailed(false)
    try {
      setPermission(await requestMicrophonePermission())
    } catch (err) {
      const code = toAppError(err).code
      if (code === 'not-supported') setPermission('unsupported')
      else setFailed(true)
    } finally {
      setRequesting(false)
    }
  }, [])

  return { permission, requesting, failed, request }
}
