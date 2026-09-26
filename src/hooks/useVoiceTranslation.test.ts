import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import type { AiProvider } from '@/services/ai'
import type { RecognitionHandlers, SpeechHandlers, SpeechRecognizer, SpeechSynthesizer } from '@/services/speech'
import type { TranslationProvider } from '@/services/translation'
import { useVoiceTranslation, type UseVoiceTranslationOptions } from './useVoiceTranslation'

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

function fakeSynth() {
  const calls: { text: string; language: string; handlers: SpeechHandlers; cancel: ReturnType<typeof vi.fn> }[] = []
  const warmUp = vi.fn()
  const synthesizer: SpeechSynthesizer = {
    isSupported: () => true,
    warmUp,
    speak(text, language, handlers = {}) {
      const c = { text, language, handlers, cancel: vi.fn() }
      calls.push(c)
      return { cancel: c.cancel }
    },
  }
  return { synthesizer, calls, warmUp }
}

const translatorOk = (): TranslationProvider => ({
  translate: vi.fn<TranslationProvider['translate']>((req) => Promise.resolve({ text: `[${req.to}] ${req.text}` })),
})

function setup(overrides: Partial<UseVoiceTranslationOptions> = {}) {
  const rec = fakeRecognizer()
  const tts = fakeSynth()
  const options: UseVoiceTranslationOptions = {
    recognizer: rec.recognizer,
    synthesizer: tts.synthesizer,
    translator: translatorOk(),
    corrector: null,
    ...overrides,
  }
  const hook = renderHook(() => useVoiceTranslation(options))
  return { ...hook, rec, tts, options }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useVoiceTranslation', () => {
  it('runs idle → listening → processing/translating → done, keeping original/corrected/translation', async () => {
    const corrector: Pick<AiProvider, 'correct'> = { correct: vi.fn(() => Promise.resolve({ corrected: 'Olá, tudo bem?', changes: ['punctuation' as const] })) }
    const { result, rec, tts } = setup({ corrector })
    expect(result.current.phase).toBe('idle')
    expect(result.current.isSupported).toBe(true)

    act(() => result.current.start({ from: 'pt-PT', to: 'it' }))
    expect(result.current.phase).toBe('listening')
    expect(rec.last().language).toBe('pt-PT')
    expect(tts.warmUp).toHaveBeenCalledOnce()

    act(() => rec.last().handlers.onPartial?.('olá tudo'))
    expect(result.current.partialTranscript).toBe('olá tudo')

    act(() => rec.last().handlers.onFinal('olá tudo bem'))
    await waitFor(() => expect(result.current.phase).toBe('done'))
    expect(result.current.result).toEqual({
      original: 'olá tudo bem',
      corrected: 'Olá, tudo bem?',
      corrections: ['punctuation'],
      translation: '[it] Olá, tudo bem?',
      from: 'pt-PT',
      to: 'it',
    })
    expect(result.current.error).toBeNull()
  })

  it('a correction failure does not block the translation', async () => {
    const corrector: Pick<AiProvider, 'correct'> = { correct: () => Promise.reject(new AppError('unavailable')) }
    const { result, rec } = setup({ corrector })
    act(() => result.current.start({ from: 'en', to: 'pl' }))
    act(() => rec.last().handlers.onFinal('hello'))
    await waitFor(() => expect(result.current.phase).toBe('done'))
    expect(result.current.result).toMatchObject({ original: 'hello', corrected: null, translation: '[pl] hello' })
  })

  it('translation errors and recognizer errors end in phase error with the AppError', async () => {
    const translator: TranslationProvider = { translate: () => Promise.reject(new AppError('offline')) }
    const { result, rec } = setup({ translator })
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => rec.last().handlers.onFinal('hello'))
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error?.code).toBe('offline')

    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => rec.last().handlers.onError(new AppError('no-speech')))
    await waitFor(() => expect(result.current.error?.code).toBe('no-speech'))
  })

  it('unsupported speech recognition fails immediately with not-supported', () => {
    const rec = fakeRecognizer(false)
    const { result } = setup({ recognizer: rec.recognizer })
    expect(result.current.isSupported).toBe(false)
    act(() => result.current.start({ from: 'en', to: 'it' }))
    expect(result.current.phase).toBe('error')
    expect(result.current.error?.code).toBe('not-supported')
    expect(rec.sessions).toHaveLength(0)
  })

  it('guards against double starts and stops early on stop()', () => {
    const { result, rec } = setup()
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => result.current.start({ from: 'en', to: 'it' }))
    expect(rec.sessions).toHaveLength(1)
    act(() => result.current.stop())
    expect(rec.last().stop).toHaveBeenCalledOnce()
  })

  it('auto-stops listening after the max duration', () => {
    vi.useFakeTimers()
    const { result, rec } = setup({ maxListenMs: 15_000 })
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => vi.advanceTimersByTime(15_000))
    expect(rec.last().stop).toHaveBeenCalledOnce()
  })

  it('cancel() aborts processing and ignores late results', async () => {
    let signal: AbortSignal | undefined
    let resolveTranslation: (v: { text: string }) => void = () => {}
    const translator: TranslationProvider = {
      translate: (_req, s) => {
        signal = s
        return new Promise((resolve) => {
          resolveTranslation = resolve
        })
      },
    }
    const { result, rec } = setup({ translator })
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => rec.last().handlers.onFinal('hello'))
    await waitFor(() => expect(result.current.phase).toBe('translating'))
    act(() => result.current.cancel())
    expect(result.current.phase).toBe('idle')
    expect(signal?.aborted).toBe(true)
    await act(async () => resolveTranslation({ text: 'ciao' }))
    expect(result.current.phase).toBe('idle')
    expect(result.current.result).toBeNull()
  })

  it('speak() / stopSpeaking() play the translation in the target language', async () => {
    const { result, rec, tts } = setup()
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => rec.last().handlers.onFinal('hello'))
    await waitFor(() => expect(result.current.phase).toBe('done'))

    act(() => result.current.speak())
    expect(result.current.speaking).toBe(true)
    expect(tts.calls[0]).toMatchObject({ text: '[it] hello', language: 'it' })
    act(() => tts.calls[0]?.handlers.onEnd?.())
    expect(result.current.speaking).toBe(false)

    act(() => result.current.speak())
    act(() => result.current.stopSpeaking())
    expect(tts.calls[1]?.cancel).toHaveBeenCalledOnce()
    expect(result.current.speaking).toBe(false)

    act(() => result.current.speak())
    act(() => tts.calls[2]?.handlers.onError?.(new AppError('not-supported')))
    expect(result.current.speaking).toBe(false)
    expect(result.current.speechError?.code).toBe('not-supported')
    expect(result.current.phase).toBe('done')
  })

  it('autoSpeak speaks as soon as the translation is ready (in-person mode)', async () => {
    const { result, rec, tts } = setup({ autoSpeak: true })
    act(() => result.current.start({ from: 'es', to: 'pt-PT' }))
    act(() => rec.last().handlers.onFinal('hola'))
    await waitFor(() => expect(result.current.speaking).toBe(true))
    expect(tts.calls[0]).toMatchObject({ text: '[pt-PT] hola', language: 'pt-PT' })
    // the other person starts talking: the playback is interrupted
    act(() => result.current.start({ from: 'pt-PT', to: 'es' }))
    expect(tts.calls[0]?.cancel).toHaveBeenCalled()
    expect(result.current.speaking).toBe(false)
    expect(result.current.result?.translation).toBe('[pt-PT] hola')
  })

  it('reset() clears the result; unmount aborts recognition and speech', async () => {
    const { result, rec, tts, unmount } = setup()
    act(() => result.current.start({ from: 'en', to: 'it' }))
    act(() => rec.last().handlers.onFinal('hello'))
    await waitFor(() => expect(result.current.phase).toBe('done'))
    act(() => result.current.reset())
    expect(result.current.result).toBeNull()
    expect(result.current.phase).toBe('idle')

    act(() => result.current.start({ from: 'en', to: 'it' }))
    unmount()
    expect(rec.last().abort).toHaveBeenCalledOnce()
    expect(tts.calls).toHaveLength(0)
  })
})
