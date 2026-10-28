import { AppError } from '../errors'

/**
 * Microphone permission as reported by the browser. Never simulates a grant: it only reads the real state.
 *  - 'granted' / 'denied' / 'prompt' → from navigator.permissions ('prompt' = the browser will ask on first use);
 *  - 'prompt' is also returned when the state cannot be read (Permissions API missing, or the
 *    'microphone' name not supported, e.g. older Firefox/Safari) — the browser will ask when listening starts;
 *  - 'unsupported' → this browser/context exposes no microphone API at all (e.g. insecure http origin).
 *
 * The Web Speech recognizer requests the permission itself when it starts; the permissions screen can also ask in
 * advance (requestMicrophonePermission).
 */
export type MicrophonePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function getMicrophonePermission(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): Promise<MicrophonePermission> {
  if (!nav) return 'unsupported'
  const hasMicApi = typeof nav.mediaDevices?.getUserMedia === 'function'
  const hasSpeechApi = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  if (!hasMicApi && !hasSpeechApi) return 'unsupported'
  if (typeof nav.permissions?.query !== 'function') return 'prompt'
  try {
    const status = await nav.permissions.query({ name: 'microphone' })
    return status.state === 'granted' || status.state === 'denied' ? status.state : 'prompt'
  } catch {
    return 'prompt'
  }
}

/**
 * Asks for the microphone for real (browser prompt; call from a tap) and releases it right away: this only obtains the
 * permission, the recognizer / recorder open the microphone themselves later. Resolves with the real permission after
 * the attempt.
 * @throws AppError 'not-supported' (no microphone API), 'unavailable' (no microphone / it is busy).
 */
export async function requestMicrophonePermission(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): Promise<MicrophonePermission> {
  if (!nav || typeof nav.mediaDevices?.getUserMedia !== 'function') throw new AppError('not-supported')
  try {
    const stream = await nav.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) return 'denied'
    if (err instanceof DOMException && err.name === 'NotSupportedError') throw new AppError('not-supported', err)
    throw new AppError('unavailable', err)
  }
  return 'granted'
}
