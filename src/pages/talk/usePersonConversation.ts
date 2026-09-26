import { useState } from 'react'
import { useVoiceTranslation } from '@/hooks/useVoiceTranslation'
import type { LanguageCode } from '@/i18n/languages'
import type { AppError } from '@/services/errors'
import { bridgeModel, isBusy, panelModel, resultSpeaker, type BridgeModel, type PanelModel, type PersonSnapshot } from './personModel'
import { otherSpeaker, useTalkLanguages, useTalkStore, withLanguage, type Speaker } from './talkStore'

export interface PersonConversation {
  languages: Readonly<Record<Speaker, LanguageCode>>
  snapshot: PersonSnapshot
  bridge: BridgeModel
  panels: Readonly<Record<Speaker, PanelModel>>
  /** Speaker's mic button: start listening (from = their language, to = the other's) or stop early. */
  talk: (side: Speaker) => void
  /** Plays the last translation again. */
  replay: () => void
  setLanguage: (side: Speaker, code: LanguageCode) => void
  /** Stops capture/processing/speech (mode switch). Keeps the last exchange on screen. */
  cancel: () => void
  speechError: AppError | null
}

/** "Conversar com pessoa": one shared voice-translation pipeline alternating between person A and person B. */
export function usePersonConversation(): PersonConversation {
  const voice = useVoiceTranslation({ autoSpeak: true })
  const languages = useTalkLanguages()
  const setLanguages = useTalkStore((s) => s.setLanguages)
  const [active, setActive] = useState<Speaker | null>(null)

  const snapshot: PersonSnapshot = {
    phase: voice.phase,
    speaking: voice.speaking,
    partialTranscript: voice.partialTranscript,
    result: voice.result,
    error: voice.error,
    canSpeak: voice.canSpeak,
    active,
    languages,
  }

  const talk = (side: Speaker) => {
    if (voice.phase === 'listening' && active === side) {
      voice.stop()
      return
    }
    if (isBusy(snapshot)) return
    setActive(side)
    voice.start({ from: languages[side], to: languages[otherSpeaker(side)] })
  }

  const replay = () => {
    if (!isBusy(snapshot) && resultSpeaker(snapshot)) voice.speak()
  }

  const setLanguage = (side: Speaker, code: LanguageCode) => {
    const next = withLanguage(languages, side, code)
    if (next === languages) return
    // A new language pair starts a fresh exchange (the shown texts belong to the old pair).
    voice.reset()
    setActive(null)
    setLanguages(next)
  }

  return {
    languages,
    snapshot,
    bridge: bridgeModel(snapshot),
    panels: { a: panelModel('a', snapshot), b: panelModel('b', snapshot) },
    talk,
    replay,
    setLanguage,
    cancel: voice.cancel,
    speechError: voice.speechError,
  }
}
