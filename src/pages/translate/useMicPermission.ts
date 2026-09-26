import { useEffect, useState } from 'react'
import { env } from '@/config/env'
import { getMicrophonePermission, type MicrophonePermission } from '@/services/speech'

/**
 * Real browser microphone permission, read (never requested) so a blocked microphone can be explained
 * before the user taps. Re-read when `recheckKey` changes and when the tab becomes visible again (the user may
 * have fixed it in the browser settings). Only meaningful for the browser recognizer: the dev mock never
 * touches the microphone, so it reports 'prompt' there.
 */
export function useMicPermission(recheckKey: unknown): MicrophonePermission | null {
  const [permission, setPermission] = useState<MicrophonePermission | null>(null)
  const relevant = env.sttProvider === 'browser'

  useEffect(() => {
    if (!relevant) return
    let active = true
    const check = () => {
      getMicrophonePermission().then(
        (p) => {
          if (active) setPermission(p)
        },
        () => {},
      )
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [relevant, recheckKey])

  return relevant ? permission : 'prompt'
}
