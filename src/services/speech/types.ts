import type { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'

/* ───────────────────────── Speech-to-text ───────────────────────── */

export interface RecognitionOptions {
  language: LanguageCode
  /** Emit interim transcripts through `onPartial` (default true). */
  interimResults?: boolean
}

/**
 * Contract (every implementation must honour it):
 *  - a session ends with EXACTLY ONE of `onFinal(text)` (non-empty, trimmed) or `onError(err)`, then `onEnd()`;
 *  - silence / empty result → `onError(AppError('no-speech'))`;
 *  - after the caller invokes `abort()`, no handler is called any more;
 *  - handlers are never called synchronously from inside `start()`.
 */
export interface RecognitionHandlers {
  onPartial?(text: string): void
  onFinal(text: string): void
  onError(err: AppError): void
  onEnd?(): void
}

export interface RecognitionSession {
  /** Stop listening and deliver what was heard so far (final result or `no-speech`). */
  stop(): void
  /** Discard everything; no further handler calls. */
  abort(): void
}

/** Single-utterance recognizer: one `start()` = one phrase. */
export interface SpeechRecognizer {
  isSupported(): boolean
  start(opts: RecognitionOptions, handlers: RecognitionHandlers): RecognitionSession
}

/* ───────────────────────── Text-to-speech ───────────────────────── */

/** After `cancel()`, no handler is called any more. */
export interface SpeechHandlers {
  onStart?(): void
  onEnd?(): void
  onError?(err: AppError): void
}

export interface SpeechPlayback {
  cancel(): void
}

export interface SpeechSynthesizer {
  isSupported(): boolean
  /** Speaks `text` in `language`, cancelling whatever this synthesizer was saying before. */
  speak(text: string, language: LanguageCode, handlers?: SpeechHandlers): SpeechPlayback
  /**
   * Optional: call synchronously inside a user gesture (tap on mic/sphere) so that later speak() calls
   * made after async work (translation, AI reply) are not blocked by autoplay policies (iOS Safari, Chrome).
   */
  warmUp?(): void
}
