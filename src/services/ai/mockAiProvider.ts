/**
 * DEVELOPMENT-ONLY AI (VITE_AI_PROVIDER=mock).
 *  - correct(): known sample phrases are restored to their canonical form (reporting punctuation / accents /
 *    capitalization); other text gets a capital first letter and final punctuation. Never reports spelling/grammar.
 *  - practice: scripted turns per scenario (mockScripts.ts), independent of what the user actually said.
 */
import { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'
import { findPhraseSet, mockLatency, normalizeForMatch, SAMPLE_PHRASES } from '../translation/mockPhrases'
import { ALL_SCRIPT_PHRASES, fillName, PRACTICE_SCRIPTS } from './mockScripts'
import type { AiProvider, CorrectionKind, CorrectionResult } from './types'

const KNOWN = [...SAMPLE_PHRASES, ...ALL_SCRIPT_PHRASES]
const MAX_CHARS = 1000

const QUESTION_WORDS: Readonly<Record<LanguageCode, readonly string[]>> = {
  en: ['what', 'where', 'when', 'who', 'why', 'how', 'which', 'can', 'could', 'do', 'does', 'did', 'is', 'are', 'will', 'would', 'should', 'may'],
  'pt-PT': ['onde', 'quando', 'como', 'porque', 'quem', 'qual', 'quais', 'quanto', 'quanta', 'posso', 'podes', 'pode'],
  es: ['donde', 'cuando', 'como', 'quien', 'cual', 'cuanto', 'puedo', 'puedes', 'puede', 'que'],
  fr: ['ou', 'quand', 'comment', 'pourquoi', 'qui', 'quel', 'quelle', 'combien', 'est', 'puis', 'peux', 'pouvez'],
  de: ['wo', 'wann', 'wie', 'warum', 'wer', 'was', 'welche', 'welcher', 'kann', 'kannst', 'konnen', 'gibt'],
  it: ['dove', 'dov', 'quando', 'come', 'perche', 'chi', 'quale', 'quanto', 'cosa', 'posso', 'puoi', 'puo'],
  pl: ['gdzie', 'kiedy', 'jak', 'dlaczego', 'kto', 'co', 'ktory', 'ile', 'czy'],
}

const stripPunct = (s: string) => s.replace(/[\p{P}]/gu, ' ').replace(/\s+/g, ' ').trim()
const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')
const punctOf = (s: string) => s.replace(/[^\p{P}]/gu, '')

function diffKinds(input: string, canonical: string): CorrectionKind[] {
  const kinds: CorrectionKind[] = []
  if (punctOf(input) !== punctOf(canonical)) kinds.push('punctuation')
  if (stripPunct(input).toLowerCase().normalize('NFC') !== stripPunct(canonical).toLowerCase().normalize('NFC')) kinds.push('accents')
  if (stripMarks(stripPunct(input)) !== stripMarks(stripPunct(canonical))) kinds.push('capitalization')
  return kinds
}

function genericCorrection(text: string, language: LanguageCode): CorrectionResult {
  let out = text
  const changes: CorrectionKind[] = []
  const first = out.charAt(0)
  if (first !== first.toUpperCase()) {
    out = first.toUpperCase() + out.slice(1)
    changes.push('capitalization')
  }
  if (!/[.!?…。]$/u.test(out)) {
    const firstWord = normalizeForMatch(out).split(' ')[0] ?? ''
    const question = QUESTION_WORDS[language].includes(firstWord)
    if (question && language === 'es' && !out.startsWith('¿')) out = `¿${out}`
    out += question ? (language === 'fr' ? ' ?' : '?') : '.'
    changes.push('punctuation')
  }
  return { corrected: out, changes }
}

export function createMockAiProvider(latencyMs = { correct: 350, practice: 900 }): AiProvider {
  return {
    async correct({ text, language }, signal) {
      const clean = text.replace(/\s+/g, ' ').trim()
      if (!clean || clean.length > MAX_CHARS) throw new AppError('invalid-input')
      await mockLatency(latencyMs.correct, signal)
      const canonical = findPhraseSet(KNOWN, clean, language)?.[language]
      if (canonical && !canonical.includes('{name}') && normalizeForMatch(canonical) === normalizeForMatch(clean)) {
        return { corrected: canonical, changes: diffKinds(clean, canonical) }
      }
      return genericCorrection(clean, language)
    },

    async practiceOpening({ scenario, language, nativeLanguage, userName }, signal) {
      await mockLatency(latencyMs.practice, signal)
      const { opening } = PRACTICE_SCRIPTS[scenario]
      return { reply: fillName(opening[language], userName), translation: fillName(opening[nativeLanguage], userName) }
    },

    async practiceReply({ scenario, language, nativeLanguage, history }, signal) {
      const userTurns = history.filter((m) => m.role === 'user').length
      if (userTurns === 0 || history.at(-1)?.role !== 'user') throw new AppError('invalid-input')
      await mockLatency(latencyMs.practice, signal)
      const { replies } = PRACTICE_SCRIPTS[scenario]
      const set = replies[(userTurns - 1) % replies.length]
      if (!set) throw new AppError('unavailable')
      return { reply: set[language], translation: set[nativeLanguage] }
    },
  }
}

export const mockAiProvider: AiProvider = createMockAiProvider()
