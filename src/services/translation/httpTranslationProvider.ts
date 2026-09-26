/**
 * Backend contract — POST {VITE_API_BASE_URL}/translate
 *
 *   Request  (application/json): { "text": string (1..1000 chars), "source": LanguageCode, "target": LanguageCode }
 *   Response 200 (application/json): { "translation": string }
 *   Errors: 429 → rate-limited, 404 → not-found, 5xx → unavailable, other non-2xx → unknown (see services/http.ts).
 *
 * LanguageCode is the registry code (pt-PT, en, pl, es, fr, de, it). The backend holds the vendor key
 * and must not log or store the text. No cookies are sent (credentials: 'omit').
 */
import { AppError } from '../errors'
import { isRecord, requestJson } from '../http'
import { isLanguageCode } from '@/i18n/languages'
import { MAX_TRANSLATION_CHARS, type TranslationProvider } from './types'

const MAX_RESPONSE_CHARS = 5000
const TIMEOUT_MS = 10_000

export function parseTranslationResponse(body: unknown): string {
  if (!isRecord(body) || typeof body.translation !== 'string') throw new AppError('unavailable')
  const text = body.translation.trim()
  if (!text || text.length > MAX_RESPONSE_CHARS) throw new AppError('unavailable')
  return text
}

export function createHttpTranslationProvider(baseUrl: string): TranslationProvider {
  return {
    async translate({ text, from, to }, signal) {
      const clean = text.trim()
      if (!clean || clean.length > MAX_TRANSLATION_CHARS || !isLanguageCode(from) || !isLanguageCode(to)) {
        throw new AppError('invalid-input')
      }
      const body = await requestJson(`${baseUrl}/translate`, {
        method: 'POST',
        body: { text: clean, source: from, target: to },
        signal,
        timeoutMs: TIMEOUT_MS,
      })
      return { text: parseTranslationResponse(body) }
    },
  }
}
