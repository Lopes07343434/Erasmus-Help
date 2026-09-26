import { useEffect, useState } from 'react'
import type { LanguageCode } from '@/i18n/languages'
import { getAiProvider, type AiProvider, type PracticeReply, type PracticeScenario } from '@/services/ai'
import { AppError, toAppError } from '@/services/errors'
import { getRecognizer, getSynthesizer, listen, type ListenHandle, type SpeechPlayback, type SpeechRecognizer, type SpeechSynthesizer } from '@/services/speech'

/**
 * "Treinar com a app": spoken practice with the AI inside a scenario. States match the sphere:
 *   idle → listening → processing → speaking → idle   (listening/processing failures → error)
 * tap() follows the design's tapSphere(): idle/error → listen · listening → stop & process ·
 * speaking → interrupt · processing → ignored. When `muted`, tap() does not start listening.
 * Nothing is persisted: the conversation lives in memory only.
 */

export type PracticeState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface PracticeHistoryItem {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Assistant messages: translation into the user's own language (null when unavailable). */
  translation: string | null
}

export interface UsePracticeConversationOptions {
  /** Conversation language (the AI speaks it; the user answers in it). */
  language: LanguageCode
  /** User's own language for the translations under AI bubbles. */
  nativeLanguage: LanguageCode
  userName?: string
  initialScenario?: PracticeScenario
  recognizer?: SpeechRecognizer
  synthesizer?: SpeechSynthesizer
  ai?: AiProvider
  /** Listening auto-stops (and is processed) after this. Default 15 s. */
  maxListenMs?: number
}

export interface PracticeConversationState {
  state: PracticeState
  /** Full conversation, oldest first (the design shows the last 3). */
  history: PracticeHistoryItem[]
  /** Set when state === 'error'. */
  error: AppError | null
  /** Live transcript of the user's current turn. */
  partialTranscript: string
  muted: boolean
  scenario: PracticeScenario
}

export interface PracticeConversation extends PracticeConversationState {
  isSupported: boolean
  canSpeak: boolean
  /** (Re)start the scenario: clears the history and fetches + speaks the AI opening line. */
  start(): void
  /** Sphere tap (see module doc). Call from a user gesture. */
  tap(): void
  /** Stop the AI voice (speaking → idle). */
  interrupt(): void
  /** Muting aborts an ongoing capture; it does not stop the AI reply. */
  setMuted(muted: boolean): void
  toggleMute(): void
  /** Aborts and clears the conversation; call start() for the new opening. */
  setScenario(scenario: PracticeScenario): void
  /** Abort everything and clear the conversation. */
  reset(): void
}

function createController(
  initialOptions: UsePracticeConversationOptions,
  update: (patch: Partial<PracticeConversationState>) => void,
  initialScenario: PracticeScenario,
) {
  let options = initialOptions
  const getOptions = () => options
  let run = 0
  let nextId = 1
  let state: PracticeState = 'idle'
  let history: PracticeHistoryItem[] = []
  let muted = false
  let scenario = initialScenario
  let listening: ListenHandle | null = null
  let aborter: AbortController | null = null
  let playback: SpeechPlayback | null = null
  let speakToken: object | null = null

  const recognizer = () => getOptions().recognizer ?? getRecognizer()
  const synthesizer = () => getOptions().synthesizer ?? getSynthesizer()
  const ai = () => getOptions().ai ?? getAiProvider()

  const setState = (next: PracticeState, patch: Partial<PracticeConversationState> = {}) => {
    state = next
    update({ ...patch, state: next })
  }
  const push = (item: Omit<PracticeHistoryItem, 'id'>) => {
    history = [...history, { ...item, id: nextId++ }]
    update({ history })
  }

  const cancelSpeech = () => {
    speakToken = null
    playback?.cancel()
    playback = null
  }

  const halt = () => {
    run += 1
    listening?.abort()
    listening = null
    aborter?.abort()
    aborter = null
    cancelSpeech()
  }

  const fail = (id: number, err: unknown) => {
    if (id !== run) return
    listening = null
    aborter = null
    setState('error', { error: toAppError(err), partialTranscript: '' })
  }

  /** Shows + speaks an AI message. TTS problems are non-fatal: the text stays visible and we go idle. */
  const deliver = (id: number, reply: PracticeReply) => {
    if (id !== run) return
    aborter = null
    push({ role: 'assistant', text: reply.reply, translation: reply.translation || null })
    const synth = synthesizer()
    if (!synth.isSupported()) return setState('idle')
    const token = {}
    speakToken = token
    setState('speaking')
    const done = () => {
      if (speakToken !== token) return
      speakToken = null
      playback = null
      setState('idle')
    }
    const pb = synth.speak(reply.reply, getOptions().language, { onEnd: done, onError: done })
    if (speakToken === token) playback = pb
  }

  const askAi = (id: number, request: (signal: AbortSignal) => Promise<PracticeReply>) => {
    const controller = new AbortController()
    aborter = controller
    setState('processing', { error: null })
    request(controller.signal).then(
      (reply) => deliver(id, reply),
      (err: unknown) => fail(id, err),
    )
  }

  const listenTurn = () => {
    halt()
    const id = run
    const rec = recognizer()
    if (!rec.isSupported()) return setState('error', { error: new AppError('not-supported') })
    synthesizer().warmUp?.() // inside the user gesture: unlocks the reply's TTS on iOS Safari
    const { language, nativeLanguage, maxListenMs } = getOptions()
    setState('listening', { error: null, partialTranscript: '' })
    const handle = listen(rec, {
      language,
      maxDurationMs: maxListenMs,
      onPartial: (text) => {
        if (id === run) update({ partialTranscript: text })
      },
    })
    listening = handle
    handle.result.then(
      (text) => {
        if (id !== run) return
        listening = null
        update({ partialTranscript: '' })
        push({ role: 'user', text, translation: null })
        const turns = history.map(({ role, text: t }) => ({ role, text: t }))
        askAi(id, (signal) => ai().practiceReply({ scenario, language, nativeLanguage, history: turns }, signal))
      },
      (err: unknown) => fail(id, err),
    )
  }

  const interrupt = () => {
    if (state !== 'speaking') return
    cancelSpeech()
    setState('idle')
  }

  const clear = () => {
    halt()
    history = []
    setState('idle', { history, error: null, partialTranscript: '' })
  }

  const setMuted = (next: boolean) => {
    if (next === muted) return
    muted = next
    update({ muted })
    if (muted && state === 'listening') {
      halt()
      setState('idle', { partialTranscript: '' })
    }
  }

  return {
    start() {
      clear()
      const id = run
      synthesizer().warmUp?.()
      const { language, nativeLanguage, userName } = getOptions()
      askAi(id, (signal) => ai().practiceOpening({ scenario, language, nativeLanguage, userName }, signal))
    },
    tap() {
      switch (state) {
        case 'idle':
        case 'error':
          if (!muted) listenTurn()
          return
        case 'listening':
          listening?.stop()
          return
        case 'speaking':
          interrupt()
          return
        case 'processing':
          return
      }
    },
    interrupt,
    setMuted,
    toggleMute: () => setMuted(!muted),
    setScenario(next: PracticeScenario) {
      scenario = next
      update({ scenario })
      clear()
    },
    reset: clear,
    configure(next: UsePracticeConversationOptions) {
      options = next
    },
    dispose: halt,
  }
}

export function usePracticeConversation(options: UsePracticeConversationOptions): PracticeConversation {
  const initialScenario = options.initialScenario ?? 'cafe'
  const [state, setState] = useState<PracticeConversationState>(() => ({
    state: 'idle',
    history: [],
    error: null,
    partialTranscript: '',
    muted: false,
    scenario: initialScenario,
  }))
  const [controller] = useState(() => createController(options, (patch) => setState((s) => ({ ...s, ...patch })), initialScenario))
  useEffect(() => {
    controller.configure(options)
  })
  useEffect(() => () => controller.dispose(), [controller])

  return {
    ...state,
    isSupported: (options.recognizer ?? getRecognizer()).isSupported(),
    canSpeak: (options.synthesizer ?? getSynthesizer()).isSupported(),
    start: controller.start,
    tap: controller.tap,
    interrupt: controller.interrupt,
    setMuted: controller.setMuted,
    toggleMute: controller.toggleMute,
    setScenario: controller.setScenario,
    reset: controller.reset,
  }
}
