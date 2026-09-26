/**
 * DEVELOPMENT-ONLY translator (VITE_TRANSLATION_PROVIDER=mock). Knows the sample phrases of the design
 * (all registry languages). Anything else comes back clearly marked as a demo — `[IT] original text` —
 * so it can never be mistaken for a real translation.
 */
import { AppError } from '../errors'
import { getLanguage } from '@/i18n/languages'
import { ALL_SCRIPT_PHRASES } from '../ai/mockScripts'
import { findPhraseSet, mockLatency, SAMPLE_PHRASES } from './mockPhrases'
import { MAX_TRANSLATION_CHARS, type TranslationProvider } from './types'

const KNOWN = [...SAMPLE_PHRASES, ...ALL_SCRIPT_PHRASES]

export function createMockTranslationProvider(latencyMs = 700): TranslationProvider {
  return {
    async translate({ text, from, to }, signal) {
      const clean = text.trim()
      if (!clean || clean.length > MAX_TRANSLATION_CHARS) throw new AppError('invalid-input')
      await mockLatency(latencyMs, signal)
      const set = findPhraseSet(KNOWN, clean, from)
      return { text: set ? set[to] : `[${getLanguage(to).short}] ${clean}` }
    },
  }
}

export const mockTranslationProvider: TranslationProvider = createMockTranslationProvider()
