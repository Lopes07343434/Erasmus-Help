import { describe, expect, it } from 'vitest'
import type { VoiceTranslationPhase, VoiceTranslationResult } from '@/hooks/useVoiceTranslation'
import { LANGUAGE_CODES } from '@/i18n/languages'
import { panelLanguageName, panelStrings, PANEL_STRINGS } from '@/i18n/panel'
import { AppError } from '@/services/errors'
import { bridgeModel, bridgeStateOf, panelModel, type PersonSnapshot } from './personModel'
import { defaultLanguages, parseTalkMode, withLanguage } from './talkStore'

const result: VoiceTranslationResult = { original: 'olá', corrected: 'Olá!', corrections: ['punctuation'], translation: '¡Hola!', from: 'pt-PT', to: 'es' }

const snap = (patch: Partial<PersonSnapshot> = {}): PersonSnapshot => ({
  phase: 'idle',
  speaking: false,
  partialTranscript: '',
  result: null,
  error: null,
  canSpeak: true,
  active: null,
  languages: { a: 'pt-PT', b: 'es' },
  ...patch,
})

describe('panel strings (i18n/panel.ts)', () => {
  it('exist, non-empty, for every registry language — including a "translated from" line per source language', () => {
    expect(Object.keys(PANEL_STRINGS).sort()).toEqual([...LANGUAGE_CODES].sort())
    for (const code of LANGUAGE_CODES) {
      const s = panelStrings(code)
      for (const key of ['you', 'speak', 'stop', 'hint', 'listening', 'translating', 'said', 'changeLanguage', 'replay'] as const) {
        expect(s[key].trim(), `${code}.${key}`).not.toBe('')
      }
      for (const from of LANGUAGE_CODES) expect(s.translatedFrom[from].trim(), `${code}.translatedFrom.${from}`).not.toBe('')
      expect(panelLanguageName(code).length).toBeGreaterThan(1)
    }
  })

  it('names each panel language in itself, capitalised', () => {
    expect(panelLanguageName('pt-PT')).toBe('Português')
    expect(panelLanguageName('es')).toBe('Español')
    expect(panelLanguageName('pl')).toBe('Polski')
    expect(panelLanguageName('de')).toBe('Deutsch')
  })
})

describe('bridgeStateOf', () => {
  it.each<[VoiceTranslationPhase, boolean, string]>([
    ['idle', false, 'idle'],
    ['listening', false, 'listening'],
    ['processing', false, 'processing'],
    ['translating', false, 'processing'],
    ['done', true, 'speaking'],
    ['idle', true, 'speaking'],
    ['done', false, 'idle'],
    ['error', false, 'error'],
  ])('%s (speaking=%s) → %s', (phase, speaking, expected) => {
    expect(bridgeStateOf(phase, speaking)).toBe(expected)
  })
})

describe('panelModel / bridgeModel', () => {
  it('A listening: A is live, B is blocked, chevrons flow up from A', () => {
    const s = snap({ phase: 'listening', active: 'a', partialTranscript: 'olá' })
    expect(panelModel('a', s)).toMatchObject({ live: true, blocked: false, hot: true, content: { kind: 'live', transcript: 'olá' } })
    expect(panelModel('b', s)).toMatchObject({ live: false, blocked: true, content: { kind: 'hint' } })
    expect(bridgeModel(s)).toEqual({ state: 'listening', flowFrom: 'a' })
  })

  it('A translating: A shows what was said, B shows the skeleton', () => {
    const s = snap({ phase: 'translating', active: 'a', partialTranscript: 'olá' })
    expect(panelModel('a', s).content).toEqual({ kind: 'said', text: 'olá' })
    expect(panelModel('b', s).content).toEqual({ kind: 'pending' })
    expect(panelModel('a', s).blocked && panelModel('b', s).blocked).toBe(true)
  })

  it('done + speaking: B receives the translation (hot), both blocked; idle afterwards: B can replay', () => {
    const speaking = snap({ phase: 'done', speaking: true, active: 'a', result })
    expect(panelModel('a', speaking).content).toEqual({ kind: 'said', text: 'Olá!' })
    expect(panelModel('b', speaking)).toMatchObject({ hot: true, blocked: true, canReplay: false, content: { kind: 'received', text: '¡Hola!', from: 'pt-PT' } })
    expect(bridgeModel(speaking)).toEqual({ state: 'speaking', flowFrom: 'a' })

    const idle = snap({ phase: 'done', active: 'a', result })
    expect(panelModel('b', idle)).toMatchObject({ hot: false, blocked: false, canReplay: true })
    expect(panelModel('a', idle).canReplay).toBe(false)
    expect(bridgeModel(idle)).toEqual({ state: 'idle', flowFrom: null })
  })

  it('error: the speaker returns to the hint and everyone can retry', () => {
    const s = snap({ phase: 'error', active: 'b', error: new AppError('no-speech'), result })
    expect(panelModel('b', s).content).toEqual({ kind: 'hint' })
    expect(panelModel('a', s).content).toEqual({ kind: 'said', text: 'Olá!' })
    expect(panelModel('a', s).blocked || panelModel('b', s).blocked).toBe(false)
    expect(bridgeModel(s)).toEqual({ state: 'error', flowFrom: null })
  })

  it('a result from another language pair is not shown', () => {
    const s = snap({ phase: 'done', result, languages: { a: 'pt-PT', b: 'it' } })
    expect(panelModel('a', s).content).toEqual({ kind: 'hint' })
    expect(panelModel('b', s).content).toEqual({ kind: 'hint' })
  })
})

describe('talk store helpers', () => {
  it('defaults: A = my language (pt-PT fallback), B = conversation language (English when equal)', () => {
    expect(defaultLanguages(null, 'es')).toEqual({ a: 'pt-PT', b: 'es' })
    expect(defaultLanguages('pl', 'pl')).toEqual({ a: 'pl', b: 'en' })
    expect(defaultLanguages('en', 'en')).toEqual({ a: 'en', b: 'pt-PT' })
  })

  it('picking the other side’s language swaps them', () => {
    expect(withLanguage({ a: 'pt-PT', b: 'es' }, 'a', 'es')).toEqual({ a: 'es', b: 'pt-PT' })
    expect(withLanguage({ a: 'pt-PT', b: 'es' }, 'b', 'it')).toEqual({ a: 'pt-PT', b: 'it' })
  })

  it('parses the URL mode (default person)', () => {
    expect(parseTalkMode(null)).toBe('person')
    expect(parseTalkMode('train')).toBe('train')
    expect(parseTalkMode('bogus')).toBe('person')
  })
})
