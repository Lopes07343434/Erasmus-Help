/**
 * Microphone permission as reported by the browser. Never simulates a grant: it only reads the real state.
 *  - 'granted' / 'denied' / 'prompt' → from navigator.permissions ('prompt' = the browser will ask on first use);
 *  - 'prompt' is also returned when the state cannot be read (Permissions API missing, or the
 *    'microphone' name not supported, e.g. older Firefox/Safari) — the browser will ask when listening starts;
 *  - 'unsupported' → this browser/context exposes no microphone API at all (e.g. insecure http origin).
 *
 * The Web Speech recognizer requests the permission itself when it starts; there is no separate prompt here.
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
