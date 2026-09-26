/**
 * Backend contract (the backend holds the LLM key; it must not log or store user text).
 *
 * POST {VITE_API_BASE_URL}/correct
 *   Request:  { "text": string (1..1000 chars), "language": LanguageCode }
 *   Response: { "corrected": string, "changes": CorrectionKind[] }
 *             CorrectionKind = "punctuation" | "accents" | "capitalization" | "spelling" | "grammar"
 *             (unknown kinds are ignored). Only fix form — never change the meaning or translate.
 *
 * POST {VITE_API_BASE_URL}/practice
 *   Request:  { "scenario": "cafe" | "landlord" | "office",
 *               "language": LanguageCode,         // language being practised: `reply` is in it
 *               "nativeLanguage": LanguageCode,   // user's language: `translation` is in it
 *               "history": [{ "role": "user" | "assistant", "text": string (≤1000) }],  // last 20, oldest first
 *               "userName"?: string (≤60) }       // opening only
 *             An EMPTY history asks for the scenario's opening line; otherwise the last item is the user's turn.
 *   Response: { "reply": string (1..2000), "translation": string (≤2000) }
 *
 * HTTP errors: 429 → rate-limited, 404 → not-found, 5xx → unavailable (services/http.ts). Malformed body → unavailable.
 */
import { AppError } from '../errors'
import { isRecord, requestJson } from '../http'
import { isLanguageCode, type LanguageCode } from '@/i18n/languages'
import {
  isCorrectionKind,
  isPracticeScenario,
  type AiProvider,
  type CorrectionResult,
  type PracticeMessage,
  type PracticeReply,
  type PracticeScenario,
} from './types'

export const MAX_AI_INPUT_CHARS = 1000
export const MAX_HISTORY_SENT = 20
const MAX_REPLY_CHARS = 2000
const MAX_NAME_CHARS = 60
const CORRECT_TIMEOUT_MS = 6000
const PRACTICE_TIMEOUT_MS = 15_000

function checkText(text: string): string {
  const clean = text.trim()
  if (!clean || clean.length > MAX_AI_INPUT_CHARS) throw new AppError('invalid-input')
  return clean
}

function checkLanguages(...codes: LanguageCode[]): void {
  if (!codes.every(isLanguageCode)) throw new AppError('invalid-input')
}

export function parseCorrectionResponse(body: unknown, original: string): CorrectionResult {
  if (!isRecord(body) || typeof body.corrected !== 'string') throw new AppError('unavailable')
  const corrected = body.corrected.trim()
  // A correction only fixes form: an empty or wildly longer text means the model went off the rails.
  if (!corrected || corrected.length > original.length * 2 + 20) throw new AppError('unavailable')
  const changes = Array.isArray(body.changes) ? [...new Set(body.changes.filter(isCorrectionKind))] : []
  return { corrected, changes }
}

export function parsePracticeResponse(body: unknown): PracticeReply {
  if (!isRecord(body) || typeof body.reply !== 'string') throw new AppError('unavailable')
  const reply = body.reply.trim()
  const translation = typeof body.translation === 'string' ? body.translation.trim() : ''
  if (!reply || reply.length > MAX_REPLY_CHARS || translation.length > MAX_REPLY_CHARS) throw new AppError('unavailable')
  return { reply, translation }
}

function sanitizeHistory(history: readonly PracticeMessage[]): PracticeMessage[] {
  return history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim() !== '')
    .slice(-MAX_HISTORY_SENT)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_AI_INPUT_CHARS) }))
}

export function createHttpAiProvider(baseUrl: string): AiProvider {
  const practice = async (
    body: { scenario: PracticeScenario; language: LanguageCode; nativeLanguage: LanguageCode; history: PracticeMessage[]; userName?: string },
    signal?: AbortSignal,
  ): Promise<PracticeReply> => {
    if (!isPracticeScenario(body.scenario)) throw new AppError('invalid-input')
    checkLanguages(body.language, body.nativeLanguage)
    const res = await requestJson(`${baseUrl}/practice`, { method: 'POST', body, signal, timeoutMs: PRACTICE_TIMEOUT_MS })
    return parsePracticeResponse(res)
  }

  return {
    async correct({ text, language }, signal) {
      const clean = checkText(text)
      checkLanguages(language)
      const res = await requestJson(`${baseUrl}/correct`, {
        method: 'POST',
        body: { text: clean, language },
        signal,
        timeoutMs: CORRECT_TIMEOUT_MS,
      })
      return parseCorrectionResponse(res, clean)
    },

    practiceReply({ scenario, language, nativeLanguage, history }, signal) {
      const clean = sanitizeHistory(history)
      if (clean.at(-1)?.role !== 'user') return Promise.reject(new AppError('invalid-input'))
      return practice({ scenario, language, nativeLanguage, history: clean }, signal)
    },

    practiceOpening({ scenario, language, nativeLanguage, userName }, signal) {
      const name = userName?.trim().slice(0, MAX_NAME_CHARS)
      return practice({ scenario, language, nativeLanguage, history: [], ...(name ? { userName: name } : {}) }, signal)
    },
  }
}
