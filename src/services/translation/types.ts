import type { LanguageCode } from '@/i18n/languages'

/** Max characters sent for translation (≈ 1–2 minutes of speech; one utterance is far below). */
export const MAX_TRANSLATION_CHARS = 1000

export interface TranslationRequest {
  text: string
  from: LanguageCode
  to: LanguageCode
}

export interface TranslationResult {
  text: string
}

/** Implementations: HTTP → our backend (holds the vendor keys), mock (dev only). */
export interface TranslationProvider {
  translate(req: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult>
}
