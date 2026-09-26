import type { VoiceTranslationPhase } from '@/hooks/useVoiceTranslation'
import type { MessageKey } from '@/i18n/types'
import { CORRECTION_KINDS, type CorrectionKind } from '@/services/ai/types'
import type { AppErrorCode } from '@/services/errors'

/**
 * What the screen shows. Same as the hook phase, except that an idle hook that still holds a result
 * (after a language change / cancel mid-capture) keeps showing it as "done" — like the design's `setLang`.
 */
export type TranslatorView = VoiceTranslationPhase

export function toView(phase: VoiceTranslationPhase, hasResult: boolean): TranslatorView {
  return phase === 'idle' && hasResult ? 'done' : phase
}

export const isBusy = (view: TranslatorView): boolean => view === 'processing' || view === 'translating'
export const isCapturing = (phase: VoiceTranslationPhase): boolean => phase === 'listening' || phase === 'processing' || phase === 'translating'

/** Progress steps of the design (`steps`): the current one is bold, the previous ones are primary. */
export const STEPS = ['listening', 'processing', 'translating', 'done'] as const
export type Step = (typeof STEPS)[number]

export function stepIndex(view: TranslatorView): number {
  return (STEPS as readonly string[]).indexOf(view)
}

/**
 * Errors are shown with errors.<key>.title and, when the translator has something more useful to say,
 * a context body from translate.errorHints (otherwise errors.<key>.body).
 */
export const ERROR_HINTS: Partial<Record<AppErrorCode, MessageKey>> = {
  'permission-denied': 'translate.errorHints.permissionDenied',
  'not-supported': 'translate.errorHints.notSupported',
  'no-speech': 'translate.errorHints.noSpeech',
  'not-configured': 'translate.errorHints.notConfigured',
  offline: 'translate.errorHints.offline',
  timeout: 'translate.errorHints.timeout',
  unavailable: 'translate.errorHints.unavailable',
  'rate-limited': 'translate.errorHints.rateLimited',
}

/** An empty transcript reaches the pipeline as 'invalid-input': for the user it means nothing was heard. */
export const displayErrorCode = (code: AppErrorCode): AppErrorCode => (code === 'invalid-input' ? 'no-speech' : code)

/** Correction kinds in a stable order, without duplicates. */
export function sortCorrections(kinds: readonly CorrectionKind[]): CorrectionKind[] {
  return CORRECTION_KINDS.filter((k) => kinds.includes(k))
}

/** "pontuação e acentos" — localized names joined with the UI locale's list conventions. */
export function formatCorrectionList(kinds: readonly CorrectionKind[], locale: string, name: (kind: CorrectionKind) => string): string {
  const names = sortCorrections(kinds).map(name)
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}
