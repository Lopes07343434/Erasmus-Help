import type { LanguageCode } from '@/i18n/languages'

export type PracticeScenario = 'cafe' | 'landlord' | 'office'
export const PRACTICE_SCENARIOS: readonly PracticeScenario[] = ['cafe', 'landlord', 'office']
export const isPracticeScenario = (v: unknown): v is PracticeScenario => typeof v === 'string' && (PRACTICE_SCENARIOS as readonly string[]).includes(v)

export type CorrectionKind = 'punctuation' | 'accents' | 'capitalization' | 'spelling' | 'grammar'
export const CORRECTION_KINDS: readonly CorrectionKind[] = ['punctuation', 'accents', 'capitalization', 'spelling', 'grammar']
export const isCorrectionKind = (v: unknown): v is CorrectionKind => typeof v === 'string' && (CORRECTION_KINDS as readonly string[]).includes(v)

export interface CorrectionRequest {
  text: string
  language: LanguageCode
}
export interface CorrectionResult {
  corrected: string
  changes: CorrectionKind[]
}

export interface PracticeMessage {
  role: 'user' | 'assistant'
  text: string
}
export interface PracticeReplyRequest {
  scenario: PracticeScenario
  /** Language being practised (the AI speaks it). */
  language: LanguageCode
  /** The user's own language: `translation` is written in it. */
  nativeLanguage: LanguageCode
  /** Whole conversation so far, oldest first; the last item is the user's new message. */
  history: PracticeMessage[]
}
export interface PracticeOpeningRequest {
  scenario: PracticeScenario
  language: LanguageCode
  nativeLanguage: LanguageCode
  userName?: string
}
export interface PracticeReply {
  reply: string
  translation: string
}

/** Text correction + practice conversation. Implementations: HTTP → our backend, mock (dev only). */
export interface AiProvider {
  correct(req: CorrectionRequest, signal?: AbortSignal): Promise<CorrectionResult>
  practiceReply(req: PracticeReplyRequest, signal?: AbortSignal): Promise<PracticeReply>
  practiceOpening(req: PracticeOpeningRequest, signal?: AbortSignal): Promise<PracticeReply>
}
