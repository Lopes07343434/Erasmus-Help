import { useEffect, useState } from 'react'
import type { LanguageCode } from '@/i18n/languages'
import { getAiProvider, isAiConfigured, type AiProvider } from '@/services/ai'
import { AppError, toAppError } from '@/services/errors'
import { getRecognizer, getSynthesizer, listen, type ListenHandle, type SpeechPlayback, type SpeechRecognizer, type SpeechSynthesizer } from '@/services/speech'
import { getTranslationProvider, runTranslationPipeline, type PipelineResult, type TranslationProvider } from '@/services/translation'

/**
 * Voice translation state machine shared by the Translator page and "Conversar com pessoa":
 *   idle → listening → processing (correction) → translating → done   (any step → error)
 * One device, one utterance at a time; in-person mode just alternates `start({ from, to })` between speakers.
 * Nothing is persisted: transcripts live in memory only.
 */

export type VoiceTranslationPhase = 'idle' | 'listening' | 'processing' | 'translating' | 'done' | 'error'

export interface VoiceTranslationResult extends PipelineResult {
  from: LanguageCode
  to: LanguageCode
}

export interface UseVoiceTranslationOptions {
  /** Injected providers (tests / special pages). Default: the ones configured in env. */
  recognizer?: SpeechRecognizer
  synthesizer?: SpeechSynthesizer
  translator?: TranslationProvider
  /** `null` disables correction. Default: the configured AI provider, or no correction if none is configured. */
  corrector?: Pick<AiProvider, 'correct'> | null
  /** Listening auto-stops (and is processed) after this. Default 15 s. */
  maxListenMs?: number
  /** Speak the translation as soon as it is ready (in-person conversation). Default false. */
  autoSpeak?: boolean
}

export interface VoiceTranslationState {
  phase: VoiceTranslationPhase
  /** Live transcript while listening; the final transcript afterwards (until the next start/cancel). */
  partialTranscript: string
  /** Last successful result. Kept while a new utterance is captured; replaced when it completes; cleared by reset(). */
  result: VoiceTranslationResult | null
  /** Set when phase === 'error'. */
  error: AppError | null
  /** TTS of the translation is playing. */
  speaking: boolean
  /** Last TTS failure (does not affect `phase`). */
  speechError: AppError | null
}

export interface VoiceTranslation extends VoiceTranslationState {
  /** Speech-to-text available (false → start() fails with 'not-supported'). */
  isSupported: boolean
  /** Text-to-speech available. */
  canSpeak: boolean
  /** Start capturing (ignored while listening/processing/translating). Call from a user gesture. */
  start(langs: { from: LanguageCode; to: LanguageCode }): void
  /** Finish listening early and process what was heard. */
  stop(): void
  /** Abort capture/processing/speech → idle (keeps the previous result). */
  cancel(): void
  /** cancel() + forget the result and error. */
  reset(): void
  /** Speak `result.translation` in `result.to`. */
  speak(): void
  stopSpeaking(): void
}

const INITIAL: VoiceTranslationState = { phase: 'idle', partialTranscript: '', result: null, error: null, speaking: false, speechError: null }
const BUSY: readonly VoiceTranslationPhase[] = ['listening', 'processing', 'translating']

function createController(initialOptions: UseVoiceTranslationOptions, update: (patch: Partial<VoiceTranslationState>) => void) {
  let options = initialOptions
  const getOptions = () => options
  let run = 0
  let phase: VoiceTranslationPhase = 'idle'
  let result: VoiceTranslationResult | null = null
  let listening: ListenHandle | null = null
  let aborter: AbortController | null = null
  let playback: SpeechPlayback | null = null
  let speakToken: object | null = null

  const recognizer = () => getOptions().recognizer ?? getRecognizer()
  const synthesizer = () => getOptions().synthesizer ?? getSynthesizer()
  const setPhase = (next: VoiceTranslationPhase, patch: Partial<VoiceTranslationState> = {}) => {
    phase = next
    update({ ...patch, phase: next })
  }

  const stopSpeaking = () => {
    const wasSpeaking = speakToken !== null
    speakToken = null
    playback?.cancel()
    playback = null
    if (wasSpeaking) update({ speaking: false })
  }

  const halt = () => {
    run += 1
    listening?.abort()
    listening = null
    aborter?.abort()
    aborter = null
    stopSpeaking()
  }

  const speakResult = (r: VoiceTranslationResult) => {
    stopSpeaking()
    const synth = synthesizer()
    if (!synth.isSupported()) {
      update({ speechError: new AppError('not-supported') })
      return
    }
    const token = {}
    speakToken = token
    update({ speaking: true, speechError: null })
    const done = (err?: AppError) => {
      if (speakToken !== token) return
      speakToken = null
      playback = null
      update(err && err.code !== 'aborted' ? { speaking: false, speechError: err } : { speaking: false })
    }
    const pb = synth.speak(r.translation, r.to, { onEnd: () => done(), onError: (err) => done(err) })
    if (speakToken === token) playback = pb
  }

  const fail = (id: number, err: unknown) => {
    if (id !== run) return
    listening = null
    aborter = null
    setPhase('error', { error: toAppError(err) })
  }

  const process = async (id: number, transcript: string, from: LanguageCode, to: LanguageCode) => {
    const opts = getOptions()
    const controller = new AbortController()
    aborter = controller
    setPhase('processing')
    try {
      const out = await runTranslationPipeline(
        { transcript, from, to },
        {
          translator: opts.translator ?? getTranslationProvider(),
          corrector: opts.corrector !== undefined ? opts.corrector : isAiConfigured() ? getAiProvider() : null,
        },
        {
          signal: controller.signal,
          onStage: (stage) => {
            if (stage === 'translating' && id === run) setPhase('translating')
          },
        },
      )
      if (id !== run) return
      aborter = null
      result = { ...out, from, to }
      setPhase('done', { result })
      if (getOptions().autoSpeak) speakResult(result)
    } catch (err) {
      fail(id, err)
    }
  }

  return {
    start({ from, to }: { from: LanguageCode; to: LanguageCode }) {
      if (BUSY.includes(phase)) return
      halt()
      const id = run
      const rec = recognizer()
      if (!rec.isSupported()) {
        setPhase('error', { error: new AppError('not-supported'), partialTranscript: '' })
        return
      }
      synthesizer().warmUp?.() // inside the user gesture: unlocks later TTS on iOS Safari
      setPhase('listening', { error: null, partialTranscript: '' })
      const handle = listen(rec, {
        language: from,
        maxDurationMs: getOptions().maxListenMs,
        onPartial: (text) => {
          if (id === run) update({ partialTranscript: text })
        },
      })
      listening = handle
      handle.result.then(
        (transcript) => {
          if (id !== run) return
          listening = null
          update({ partialTranscript: transcript })
          void process(id, transcript, from, to)
        },
        (err: unknown) => fail(id, err),
      )
    },
    stop() {
      if (phase === 'listening') listening?.stop()
    },
    cancel() {
      halt()
      setPhase('idle', { partialTranscript: '', error: null })
    },
    reset() {
      halt()
      result = null
      setPhase('idle', { partialTranscript: '', error: null, result: null, speechError: null })
    },
    speak() {
      if (result) speakResult(result)
    },
    stopSpeaking,
    configure(next: UseVoiceTranslationOptions) {
      options = next
    },
    dispose: halt,
  }
}

export function useVoiceTranslation(options: UseVoiceTranslationOptions = {}): VoiceTranslation {
  const [state, setState] = useState<VoiceTranslationState>(INITIAL)
  const [controller] = useState(() => createController(options, (patch) => setState((s) => ({ ...s, ...patch }))))
  useEffect(() => {
    controller.configure(options)
  })
  useEffect(() => () => controller.dispose(), [controller])

  return {
    ...state,
    isSupported: (options.recognizer ?? getRecognizer()).isSupported(),
    canSpeak: (options.synthesizer ?? getSynthesizer()).isSupported(),
    start: controller.start,
    stop: controller.stop,
    cancel: controller.cancel,
    reset: controller.reset,
    speak: controller.speak,
    stopSpeaking: controller.stopSpeaking,
  }
}
