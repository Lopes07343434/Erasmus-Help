import { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'
import { isCorrectionKind, type AiProvider, type CorrectionKind } from '../ai/types'
import type { TranslationProvider } from './types'

/**
 * Recognized transcript → (optional, tolerant) correction → translation. Pure orchestration, no React.
 * The original transcript is never modified: original, corrected and translated text are kept apart.
 */

/** Correction is a nice-to-have: after this, translation goes ahead with the original text. */
export const CORRECTION_TIMEOUT_MS = 5000

export type PipelineStage = 'correcting' | 'translating'

export interface PipelineInput {
  transcript: string
  from: LanguageCode
  to: LanguageCode
}

export interface PipelineDeps {
  translator: TranslationProvider
  /** Omit / null to skip correction. */
  corrector?: Pick<AiProvider, 'correct'> | null
}

export interface PipelineOptions {
  signal?: AbortSignal
  correctionTimeoutMs?: number
  onStage?(stage: PipelineStage): void
}

export interface PipelineResult {
  /** What the speech engine heard (trimmed). */
  original: string
  /** Corrected text, or null when correction was skipped, failed, timed out or changed nothing. */
  corrected: string | null
  /** Kinds of changes reported by the corrector ([] when `corrected` is null). */
  corrections: CorrectionKind[]
  /** Translation of `corrected ?? original` (same text when from === to). */
  translation: string
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError('aborted')
}

/** Never throws: any failure (error, timeout, invalid output) → null. */
async function tryCorrect(
  corrector: Pick<AiProvider, 'correct'>,
  text: string,
  language: LanguageCode,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ corrected: string; changes: CorrectionKind[] } | null> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const giveUp = new Promise<null>((resolve) => {
      timer = setTimeout(() => controller.abort(), timeoutMs)
      controller.signal.addEventListener('abort', () => resolve(null), { once: true })
    })
    const result = await Promise.race([corrector.correct({ text, language }, controller.signal), giveUp])
    const corrected = result?.corrected.trim()
    if (!result || !corrected) return null
    return { corrected, changes: [...new Set(result.changes.filter(isCorrectionKind))] }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function runTranslationPipeline(input: PipelineInput, deps: PipelineDeps, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const { signal } = opts
  throwIfAborted(signal)
  const original = input.transcript.trim()
  if (!original) throw new AppError('invalid-input')

  let corrected: string | null = null
  let corrections: CorrectionKind[] = []
  if (deps.corrector) {
    opts.onStage?.('correcting')
    const outcome = await tryCorrect(deps.corrector, original, input.from, opts.correctionTimeoutMs ?? CORRECTION_TIMEOUT_MS, signal)
    throwIfAborted(signal)
    if (outcome && outcome.corrected !== original) {
      corrected = outcome.corrected
      corrections = outcome.changes
    }
  }

  opts.onStage?.('translating')
  const source = corrected ?? original
  if (input.from === input.to) return { original, corrected, corrections, translation: source }

  const { text } = await deps.translator.translate({ text: source, from: input.from, to: input.to }, signal)
  throwIfAborted(signal)
  const translation = text.trim()
  if (!translation) throw new AppError('unavailable')
  return { original, corrected, corrections, translation }
}
