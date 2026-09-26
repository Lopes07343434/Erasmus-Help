import { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'
import type { RecognitionSession, SpeechRecognizer } from './types'

/** Hard cap for one utterance: listening auto-stops (and is processed) after this. */
export const DEFAULT_MAX_LISTEN_MS = 15_000

export interface ListenOptions {
  language: LanguageCode
  interimResults?: boolean
  maxDurationMs?: number
  onPartial?(text: string): void
}

export interface ListenHandle {
  /** Final transcript (trimmed, non-empty) or AppError (`no-speech`, `permission-denied`, `aborted`, …). */
  result: Promise<string>
  /** Finish early and process what was heard. */
  stop(): void
  /** Discard: `result` rejects with AppError('aborted'). */
  abort(): void
}

/**
 * Promise wrapper around one recognition session, with a max duration.
 * Unsupported recognizer → rejects with `not-supported` without starting anything.
 */
export function listen(recognizer: SpeechRecognizer, opts: ListenOptions): ListenHandle {
  if (!recognizer.isSupported()) {
    return { result: Promise.reject(new AppError('not-supported')), stop() {}, abort() {} }
  }

  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let session: RecognitionSession | null = null
  let rejectResult: ((err: AppError) => void) | null = null

  const result = new Promise<string>((resolve, reject) => {
    rejectResult = reject
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    session = recognizer.start(
      { language: opts.language, interimResults: opts.interimResults ?? true },
      {
        onPartial: (text) => {
          if (!settled) opts.onPartial?.(text)
        },
        onFinal: (text) =>
          done(() => {
            const clean = text.trim()
            if (clean) resolve(clean)
            else reject(new AppError('no-speech'))
          }),
        onError: (err) => done(() => reject(err)),
      },
    )
  })

  timer = setTimeout(() => session?.stop(), opts.maxDurationMs ?? DEFAULT_MAX_LISTEN_MS)

  return {
    result,
    stop() {
      if (!settled) session?.stop()
    },
    abort() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      session?.abort()
      rejectResult?.(new AppError('aborted'))
    },
  }
}
