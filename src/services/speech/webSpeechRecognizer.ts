import { AppError, type AppErrorCode } from '../errors'
import { getLanguage } from '@/i18n/languages'
import type { RecognitionSession, SpeechRecognizer } from './types'

/*
 * Web Speech API speech-to-text (window.SpeechRecognition / webkitSpeechRecognition).
 * Availability: Chrome/Edge (desktop + Android) and Safari 14.1+ (macOS/iOS). Not available in Firefox.
 * Chrome and Edge send the audio to the vendor's cloud service, so it needs a connection; Safari may run on-device.
 * Nothing is recorded or stored by the app: the browser streams audio to its engine and we only receive text.
 */

/* Minimal typings — the DOM lib declares the result types but not the recognizer itself. */
export interface WebSpeechAlternative {
  readonly transcript: string
}
export interface WebSpeechResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: WebSpeechAlternative
}
export interface WebSpeechResultList {
  readonly length: number
  readonly [index: number]: WebSpeechResult
}
export interface WebSpeechResultEvent {
  readonly results: WebSpeechResultList
}
export interface WebSpeechErrorEvent {
  readonly error: string
}
export interface WebSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: WebSpeechResultEvent) => void) | null
  onerror: ((ev: WebSpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
export type WebSpeechRecognitionCtor = new () => WebSpeechRecognition

export function findWebSpeechRecognition(): WebSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: WebSpeechRecognitionCtor; webkitSpeechRecognition?: WebSpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

/** Maps SpeechRecognitionErrorEvent.error to our error vocabulary. */
export function mapRecognitionError(code: string, online: boolean = isOnline()): AppErrorCode {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'permission-denied'
    case 'no-speech':
      return 'no-speech'
    case 'network':
      return online ? 'unavailable' : 'offline'
    case 'aborted':
      return 'aborted'
    case 'language-not-supported':
      return 'not-supported'
    default:
      return 'unknown'
  }
}

/** 'audio-capture' means "no usable microphone": distinguish a missing device from a blocked/busy one. */
async function audioCaptureError(): Promise<AppErrorCode> {
  try {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!md?.enumerateDevices) return 'permission-denied'
    const devices = await md.enumerateDevices()
    return devices.some((d) => d.kind === 'audioinput') ? 'permission-denied' : 'not-supported'
  } catch {
    return 'permission-denied'
  }
}

const joinText = (...parts: string[]) => parts.join(' ').replace(/\s+/g, ' ').trim()

export interface WebSpeechRecognizerOptions {
  /** Injected in tests; defaults to the browser global. */
  getConstructor?: () => WebSpeechRecognitionCtor | null
  /** After stop(), finalize ourselves if the browser never fires `end` (seen on some Android/Safari builds). */
  stopGraceMs?: number
}

export function createWebSpeechRecognizer(options: WebSpeechRecognizerOptions = {}): SpeechRecognizer {
  const getCtor = options.getConstructor ?? findWebSpeechRecognition
  const stopGraceMs = options.stopGraceMs ?? 3000

  return {
    isSupported: () => getCtor() !== null,

    start(opts, handlers): RecognitionSession {
      let rec: WebSpeechRecognition | null = null
      let finals = ''
      let interim = ''
      let rawError: string | null = null
      let settled = false
      let aborted = false
      let stopping = false
      let graceTimer: ReturnType<typeof setTimeout> | undefined

      const detach = () => {
        clearTimeout(graceTimer)
        if (rec) {
          rec.onresult = null
          rec.onerror = null
          rec.onend = null
        }
      }

      const emitError = (code: AppErrorCode, cause?: unknown) => {
        if (aborted) return
        handlers.onError(new AppError(code, cause))
        handlers.onEnd?.()
      }

      /** Decides the outcome exactly once. Text heard wins over late errors; silence → no-speech. */
      const settle = () => {
        if (settled) return
        settled = true
        detach()
        if (aborted) return
        const text = joinText(finals, interim)
        if (text) {
          handlers.onFinal(text)
          handlers.onEnd?.()
        } else if (rawError === 'audio-capture') {
          void audioCaptureError().then((code) => emitError(code))
        } else {
          emitError(rawError === null ? 'no-speech' : mapRecognitionError(rawError))
        }
      }

      const failAsync = (code: AppErrorCode, cause?: unknown) => {
        settled = true
        detach()
        queueMicrotask(() => emitError(code, cause))
      }

      const session: RecognitionSession = {
        stop() {
          if (settled || aborted || stopping || !rec) return
          stopping = true
          try {
            rec.stop()
          } catch {
            /* already stopped */
          }
          graceTimer = setTimeout(settle, stopGraceMs)
        },
        abort() {
          if (aborted) return
          aborted = true
          const wasSettled = settled
          settled = true
          detach()
          if (!wasSettled && rec) {
            try {
              rec.abort()
            } catch {
              /* already ended */
            }
          }
        },
      }

      const Ctor = getCtor()
      if (!Ctor) {
        failAsync('not-supported')
        return session
      }

      try {
        rec = new Ctor()
        rec.lang = getLanguage(opts.language).speechTag
        rec.continuous = false // single utterance: the engine ends the session after a pause
        rec.interimResults = opts.interimResults ?? true
        rec.maxAlternatives = 1
        rec.onresult = (ev) => {
          let f = ''
          let i = ''
          for (let k = 0; k < ev.results.length; k++) {
            const result = ev.results[k]
            const transcript = result?.[0]?.transcript
            if (!result || !transcript) continue
            if (result.isFinal) f = joinText(f, transcript)
            else i = joinText(i, transcript)
          }
          finals = f
          interim = i
          const text = joinText(f, i)
          if (text && !settled && !aborted) handlers.onPartial?.(text)
        }
        rec.onerror = (ev) => {
          rawError ??= ev.error
          settle()
        }
        rec.onend = () => settle()
        rec.start()
      } catch (err) {
        const denied = err instanceof DOMException && err.name === 'NotAllowedError'
        failAsync(denied ? 'permission-denied' : 'unavailable', err)
      }

      return session
    },
  }
}

export const webSpeechRecognizer: SpeechRecognizer = createWebSpeechRecognizer()
