import type { SphereState } from '@/components/sphere'
import type { VoiceTranslationPhase, VoiceTranslationResult } from '@/hooks/useVoiceTranslation'
import type { LanguageCode } from '@/i18n/languages'
import type { AppError } from '@/services/errors'
import { otherSpeaker, type Speaker, type SpeakerLanguages } from './talkStore'

/**
 * Pure view model of "Conversar com pessoa" (Person A ↔ Erasmus Help ↔ Person B), derived from the
 * voice-translation hook state + who started the current turn. Mirrors the prototype's panel()/bridge logic.
 */

export interface PersonSnapshot {
  phase: VoiceTranslationPhase
  /** TTS of the translation is playing. */
  speaking: boolean
  partialTranscript: string
  result: VoiceTranslationResult | null
  error: AppError | null
  canSpeak: boolean
  /** Who started the current / last turn. */
  active: Speaker | null
  languages: SpeakerLanguages
}

export type PanelContent =
  | { kind: 'hint' }
  | { kind: 'live'; transcript: string }
  | { kind: 'pending' }
  | { kind: 'said'; text: string }
  | { kind: 'received'; text: string; from: LanguageCode }

export interface PanelModel {
  content: PanelContent
  /** This side is listening: the mic button becomes "Stop". */
  live: boolean
  /** The other side (or the bridge) is busy: this side's mic button is disabled. */
  blocked: boolean
  /** Primary border: listening, or its received translation is being played. */
  hot: boolean
  /** Replay button next to a received translation (idle only, TTS available). */
  canReplay: boolean
}

export interface BridgeModel {
  state: SphereState
  /** Speaker the flow chevrons point away from (null → chevrons hidden). */
  flowFrom: Speaker | null
}

const TURN_PHASES: readonly VoiceTranslationPhase[] = ['processing', 'translating']
const isTurnPhase = (phase: VoiceTranslationPhase) => TURN_PHASES.includes(phase)

/** Hook state → sphere/bridge state. */
export function bridgeStateOf(phase: VoiceTranslationPhase, speaking: boolean): SphereState {
  if (phase === 'listening') return 'listening'
  if (isTurnPhase(phase)) return 'processing'
  if (speaking) return 'speaking'
  if (phase === 'error') return 'error'
  return 'idle'
}

/** Speaker whose utterance produced `result` (null when the language pair no longer matches it). */
export function resultSpeaker({ result, languages }: Pick<PersonSnapshot, 'result' | 'languages'>): Speaker | null {
  if (!result) return null
  if (result.from === languages.a && result.to === languages.b) return 'a'
  if (result.from === languages.b && result.to === languages.a) return 'b'
  return null
}

export function isBusy({ phase, speaking }: Pick<PersonSnapshot, 'phase' | 'speaking'>): boolean {
  return phase === 'listening' || isTurnPhase(phase) || speaking
}

export function panelModel(side: Speaker, snap: PersonSnapshot): PanelModel {
  const other = otherSpeaker(side)
  const { phase, active, result } = snap
  const owner = resultSpeaker(snap)
  const live = phase === 'listening' && active === side

  let content: PanelContent = { kind: 'hint' }
  if (live) content = { kind: 'live', transcript: snap.partialTranscript }
  else if (isTurnPhase(phase) && active === side) content = { kind: 'said', text: snap.partialTranscript }
  else if (isTurnPhase(phase) && active === other) content = { kind: 'pending' }
  else if (phase === 'error' && active === side) content = { kind: 'hint' }
  else if (result && owner === side) content = { kind: 'said', text: result.corrected ?? result.original }
  else if (result && owner === other) content = { kind: 'received', text: result.translation, from: snap.languages[other] }

  const busy = isBusy(snap)
  return {
    content,
    live,
    blocked: busy && !live,
    hot: live || (content.kind === 'received' && snap.speaking),
    canReplay: content.kind === 'received' && !busy && snap.canSpeak,
  }
}

export function bridgeModel(snap: PersonSnapshot): BridgeModel {
  const state = bridgeStateOf(snap.phase, snap.speaking)
  const flowFrom =
    state === 'listening' || state === 'processing' ? (snap.active ?? 'a') : state === 'speaking' ? (resultSpeaker(snap) ?? snap.active) : null
  return { state, flowFrom }
}
