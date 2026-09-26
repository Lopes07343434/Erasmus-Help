import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import type { AiProvider, PracticeReplyRequest } from '@/services/ai'
import type { RecognitionHandlers, SpeechHandlers, SpeechRecognizer, SpeechSynthesizer } from '@/services/speech'
import { usePracticeConversation, type UsePracticeConversationOptions } from './usePracticeConversation'

function fakeRecognizer(supported = true) {
  const sessions: { language: string; handlers: RecognitionHandlers; stop: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] = []
  const recognizer: SpeechRecognizer = {
    isSupported: () => supported,
    start(opts, handlers) {
      const s = { language: opts.language, handlers, stop: vi.fn(), abort: vi.fn() }
      sessions.push(s)
      return { stop: s.stop, abort: s.abort }
    },
  }
  const last = () => {
    const s = sessions.at(-1)
    if (!s) throw new Error('recognizer not started')
    return s
  }
  return { recognizer, sessions, last }
}

function fakeSynth(supported = true) {
  const calls: { text: string; language: string; handlers: SpeechHandlers; cancel: ReturnType<typeof vi.fn> }[] = []
  const synthesizer: SpeechSynthesizer = {
    isSupported: () => supported,
    warmUp: vi.fn(),
    speak(text, language, handlers = {}) {
      const c = { text, language, handlers, cancel: vi.fn() }
      calls.push(c)
      return { cancel: c.cancel }
    },
  }
  const last = () => {
    const c = calls.at(-1)
    if (!c) throw new Error('nothing spoken')
    return c
  }
  return { synthesizer, calls, last }
}

function fakeAi() {
  const replies: PracticeReplyRequest[] = []
  const ai: AiProvider = {
    correct: vi.fn(() => Promise.reject(new AppError('not-configured'))),
    practiceOpening: vi.fn<AiProvider['practiceOpening']>(({ userName }) =>
      Promise.resolve({ reply: `Ciao ${userName ?? ''}! Cosa prendi?`, translation: 'Olá! O que vais tomar?' }),
    ),
    practiceReply: vi.fn<AiProvider['practiceReply']>((req) => {
      replies.push(structuredClone(req))
      return Promise.resolve({ reply: 'Certo! Al banco o al tavolo?', translation: 'Claro! Ao balcão ou à mesa?' })
    }),
  }
  return { ai, replies }
}

function setup(overrides: Partial<UsePracticeConversationOptions> = {}) {
  const rec = fakeRecognizer()
  const tts = fakeSynth()
  const { ai, replies } = fakeAi()
  const options: UsePracticeConversationOptions = {
    language: 'it',
    nativeLanguage: 'pt-PT',
    userName: 'Ana',
    recognizer: rec.recognizer,
    synthesizer: tts.synthesizer,
    ai,
    ...overrides,
  }
  const hook = renderHook(() => usePracticeConversation(options))
  return { ...hook, rec, tts, ai, replies }
}

describe('usePracticeConversation', () => {
  it('start(): fetches the opening, speaks it in the conversation language, then idles', async () => {
    const { result, tts, ai } = setup()
    expect(result.current.scenario).toBe('cafe')
    act(() => result.current.start())
    expect(result.current.state).toBe('processing')
    await waitFor(() => expect(result.current.state).toBe('speaking'))
    expect(ai.practiceOpening).toHaveBeenCalledWith({ scenario: 'cafe', language: 'it', nativeLanguage: 'pt-PT', userName: 'Ana' }, expect.any(AbortSignal))
    expect(result.current.history).toEqual([{ id: 1, role: 'assistant', text: 'Ciao Ana! Cosa prendi?', translation: 'Olá! O que vais tomar?' }])
    expect(tts.last()).toMatchObject({ text: 'Ciao Ana! Cosa prendi?', language: 'it' })
    act(() => tts.last().handlers.onEnd?.())
    expect(result.current.state).toBe('idle')
  })

  it('tap cycle: idle → listening → (tap) stop → processing → speaking → idle', async () => {
    const { result, rec, tts, replies } = setup()
    act(() => result.current.start())
    await waitFor(() => expect(result.current.state).toBe('speaking'))
    act(() => tts.last().handlers.onEnd?.())

    act(() => result.current.tap())
    expect(result.current.state).toBe('listening')
    expect(rec.last().language).toBe('it')
    act(() => rec.last().handlers.onPartial?.('vorrei'))
    expect(result.current.partialTranscript).toBe('vorrei')

    act(() => result.current.tap())
    expect(rec.last().stop).toHaveBeenCalledOnce()
    act(() => rec.last().handlers.onFinal('vorrei un cappuccino'))
    await waitFor(() => expect(result.current.state).toBe('speaking'))
    expect(replies[0]).toEqual({
      scenario: 'cafe',
      language: 'it',
      nativeLanguage: 'pt-PT',
      history: [
        { role: 'assistant', text: 'Ciao Ana! Cosa prendi?' },
        { role: 'user', text: 'vorrei un cappuccino' },
      ],
    })
    expect(result.current.history.map((h) => h.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(result.current.history[2]?.translation).toBe('Claro! Ao balcão ou à mesa?')

    // tap while speaking interrupts
    act(() => result.current.tap())
    expect(tts.last().cancel).toHaveBeenCalledOnce()
    expect(result.current.state).toBe('idle')
  })

  it('muted: tap does not listen; muting aborts an ongoing capture', () => {
    const { result, rec } = setup()
    act(() => result.current.toggleMute())
    expect(result.current.muted).toBe(true)
    act(() => result.current.tap())
    expect(rec.sessions).toHaveLength(0)
    expect(result.current.state).toBe('idle')

    act(() => result.current.setMuted(false))
    act(() => result.current.tap())
    expect(result.current.state).toBe('listening')
    act(() => result.current.setMuted(true))
    expect(rec.last().abort).toHaveBeenCalledOnce()
    expect(result.current.state).toBe('idle')
  })

  it('recognition and AI errors → error state; tapping again retries', async () => {
    const failingAi = fakeAi()
    failingAi.ai.practiceReply = vi.fn(() => Promise.reject(new AppError('rate-limited')))
    const { result, rec } = setup({ ai: failingAi.ai })

    act(() => result.current.tap())
    act(() => rec.last().handlers.onError(new AppError('no-speech')))
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.error?.code).toBe('no-speech')

    act(() => result.current.tap())
    expect(result.current.state).toBe('listening')
    expect(result.current.error).toBeNull()
    act(() => rec.last().handlers.onFinal('ciao'))
    await waitFor(() => expect(result.current.error?.code).toBe('rate-limited'))
    expect(result.current.state).toBe('error')
    expect(result.current.history).toHaveLength(1)
  })

  it('unsupported recognition → error not-supported; without TTS replies go straight to idle', async () => {
    const noStt = setup({ recognizer: fakeRecognizer(false).recognizer })
    act(() => noStt.result.current.tap())
    expect(noStt.result.current.state).toBe('error')
    expect(noStt.result.current.error?.code).toBe('not-supported')

    const noTts = setup({ synthesizer: fakeSynth(false).synthesizer })
    act(() => noTts.result.current.start())
    await waitFor(() => expect(noTts.result.current.history).toHaveLength(1))
    expect(noTts.result.current.state).toBe('idle')
  })

  it('setScenario() clears the conversation; unmount aborts everything', async () => {
    const { result, rec, tts, unmount } = setup()
    act(() => result.current.start())
    await waitFor(() => expect(result.current.state).toBe('speaking'))
    act(() => result.current.setScenario('landlord'))
    expect(tts.last().cancel).toHaveBeenCalledOnce()
    expect(result.current.scenario).toBe('landlord')
    expect(result.current.history).toEqual([])
    expect(result.current.state).toBe('idle')

    act(() => result.current.tap())
    unmount()
    expect(rec.last().abort).toHaveBeenCalledOnce()
  })
})
