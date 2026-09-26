import { create } from 'zustand'
import { LANGUAGE_CODES, type LanguageCode } from '@/i18n/languages'

export interface LanguagePair {
  from: LanguageCode
  to: LanguageCode
}

export type PairSide = keyof LanguagePair

/** Fallback source when the profile has no language yet. */
export const DEFAULT_SOURCE: LanguageCode = 'pt-PT'

/**
 * Default pair: my language → conversation language. When both are the same, the target becomes English
 * (or, when the source already is English, the first other language of the registry).
 */
export function defaultPair(myLanguage: LanguageCode | null, conversationLanguage: LanguageCode): LanguagePair {
  const from = myLanguage ?? DEFAULT_SOURCE
  if (conversationLanguage !== from) return { from, to: conversationLanguage }
  const to = from !== 'en' ? 'en' : (LANGUAGE_CODES.find((c) => c !== from) ?? DEFAULT_SOURCE)
  return { from, to }
}

/** Picks `code` for one side; picking the language already on the other side swaps them (design `setLang`). */
export function chooseLanguage(pair: LanguagePair, side: PairSide, code: LanguageCode): LanguagePair {
  if (pair[side] === code) return pair
  if (side === 'from') return pair.to === code ? { from: code, to: pair.from } : { from: code, to: pair.to }
  return pair.from === code ? { from: pair.to, to: code } : { from: pair.from, to: code }
}

export const swapPair = (pair: LanguagePair): LanguagePair => ({ from: pair.to, to: pair.from })

interface LanguagePairState {
  /** null until the user changes it: the page then follows profile.myLanguage → settings.conversationLanguage. */
  pair: LanguagePair | null
  setPair: (pair: LanguagePair) => void
}

/** Session-only (not persisted) translator pair: survives tab changes, resets on reload. */
export const useLanguagePairStore = create<LanguagePairState>()((set) => ({
  pair: null,
  setPair: (pair) => set({ pair }),
}))
