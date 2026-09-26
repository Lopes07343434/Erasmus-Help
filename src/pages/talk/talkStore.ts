import { create } from 'zustand'
import type { LanguageCode } from '@/i18n/languages'
import type { PracticeScenario } from '@/services/ai'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'

/** `/talk?mode=person|train` (default person). */
export type TalkMode = 'person' | 'train'
export const parseTalkMode = (value: string | null): TalkMode => (value === 'train' ? 'train' : 'person')

/** Person A = the phone owner (bottom panel) · person B = the person sitting opposite (top panel, rotated). */
export type Speaker = 'a' | 'b'
export type SpeakerLanguages = Readonly<Record<Speaker, LanguageCode>>

export const otherSpeaker = (s: Speaker): Speaker => (s === 'a' ? 'b' : 'a')

interface TalkState {
  /** Languages picked on this page; null → follow the profile/settings defaults. */
  languages: SpeakerLanguages | null
  /** Last practice scenario (initial scenario the next time the page mounts). */
  scenario: PracticeScenario
  setLanguages: (languages: SpeakerLanguages) => void
  setScenario: (scenario: PracticeScenario) => void
}

/** Session-only state of the Conversar page (not persisted): survives tab switches and page visits. */
export const useTalkStore = create<TalkState>()((set) => ({
  languages: null,
  scenario: 'cafe',
  setLanguages: (languages) => set({ languages }),
  setScenario: (scenario) => set({ scenario }),
}))

/** A = my language (fallback pt-PT); B = conversation language, or English when it equals A. */
export function defaultLanguages(myLanguage: LanguageCode | null, conversationLanguage: LanguageCode): SpeakerLanguages {
  const a = myLanguage ?? 'pt-PT'
  const b = conversationLanguage !== a ? conversationLanguage : a !== 'en' ? 'en' : 'pt-PT'
  return { a, b }
}

/** Sets one side's language; picking the other side's language swaps them (as in the prototype). */
export function withLanguage(current: SpeakerLanguages, side: Speaker, code: LanguageCode): SpeakerLanguages {
  if (current[side] === code) return current
  const swapped = current[otherSpeaker(side)] === code
  return side === 'a' ? { a: code, b: swapped ? current.a : current.b } : { a: swapped ? current.b : current.a, b: code }
}

export function useTalkLanguages(): SpeakerLanguages {
  const myLanguage = useProfileStore((s) => s.myLanguage)
  const conversationLanguage = useSettingsStore((s) => s.conversationLanguage)
  const chosen = useTalkStore((s) => s.languages)
  return chosen ?? defaultLanguages(myLanguage, conversationLanguage)
}
