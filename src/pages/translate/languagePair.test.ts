import { describe, expect, it } from 'vitest'
import { chooseLanguage, defaultPair, swapPair } from './languagePair'
import { formatCorrectionList, stepIndex, toView } from './translatorView'

describe('language pair', () => {
  it('defaults to my language → conversation language, with fallbacks', () => {
    expect(defaultPair('pl', 'it')).toEqual({ from: 'pl', to: 'it' })
    expect(defaultPair(null, 'en')).toEqual({ from: 'pt-PT', to: 'en' })
    // same language on both sides → another sensible target
    expect(defaultPair('it', 'it')).toEqual({ from: 'it', to: 'en' })
    expect(defaultPair('en', 'en')).toEqual({ from: 'en', to: 'pt-PT' })
    expect(defaultPair(null, 'pt-PT')).toEqual({ from: 'pt-PT', to: 'en' })
  })

  it('choosing a language sets that side; choosing the other side’s language swaps them', () => {
    const pair = { from: 'pt-PT', to: 'en' } as const
    expect(chooseLanguage(pair, 'from', 'pl')).toEqual({ from: 'pl', to: 'en' })
    expect(chooseLanguage(pair, 'to', 'it')).toEqual({ from: 'pt-PT', to: 'it' })
    expect(chooseLanguage(pair, 'from', 'en')).toEqual({ from: 'en', to: 'pt-PT' })
    expect(chooseLanguage(pair, 'to', 'pt-PT')).toEqual({ from: 'en', to: 'pt-PT' })
    expect(chooseLanguage(pair, 'to', 'en')).toBe(pair)
    expect(swapPair(pair)).toEqual({ from: 'en', to: 'pt-PT' })
  })
})

describe('translator view helpers', () => {
  it('an idle hook that still holds a result keeps showing it as done', () => {
    expect(toView('idle', true)).toBe('done')
    expect(toView('idle', false)).toBe('idle')
    expect(toView('listening', true)).toBe('listening')
    expect(stepIndex('translating')).toBe(2)
    expect(stepIndex('error')).toBe(-1)
  })

  it('formats correction kinds in a stable order with the locale list conventions', () => {
    const names = { punctuation: 'pontuação', accents: 'acentos', capitalization: 'maiúsculas', spelling: 'ortografia', grammar: 'gramática' }
    expect(formatCorrectionList(['accents', 'punctuation'], 'pt-PT', (k) => names[k])).toBe('pontuação e acentos')
    expect(formatCorrectionList(['grammar', 'accents', 'punctuation'], 'pt-PT', (k) => names[k])).toBe('pontuação, acentos e gramática')
    expect(formatCorrectionList(['spelling', 'grammar'], 'en', (k) => k)).toBe('spelling and grammar')
  })
})
