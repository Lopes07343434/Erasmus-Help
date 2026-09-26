import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../errors'
import { createWebSpeechSynthesizer, mapSynthesisError, pickVoice, splitForSpeech, type SpeechEngine } from './webSpeechSynthesizer'

class FakeUtterance {
  text: string
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  rate = 1
  pitch = 1
  volume = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((ev: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

const voice = (lang: string, name = lang, extra: Partial<SpeechSynthesisVoice> = {}) =>
  ({ lang, name, voiceURI: name, localService: false, default: false, ...extra }) as SpeechSynthesisVoice

function fakeEngine(initialVoices: SpeechSynthesisVoice[] = []) {
  let voices = initialVoices
  const spoken: FakeUtterance[] = []
  const listeners = new Set<() => void>()
  const synth = {
    speaking: false,
    paused: false,
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u)
    }),
    cancel: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
  }
  const engine: SpeechEngine = {
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  }
  return {
    engine,
    synth,
    spoken,
    setVoices(v: SpeechSynthesisVoice[]) {
      voices = v
      listeners.forEach((cb) => cb())
    },
  }
}

function handlers() {
  return { onStart: vi.fn<() => void>(), onEnd: vi.fn<() => void>(), onError: vi.fn<(err: AppError) => void>() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('pickVoice', () => {
  const voices = [voice('pt-BR', 'Luciana'), voice('pt_PT', 'Joana'), voice('en-US'), voice('en-GB', 'Daniel'), voice('en-GB', 'Libby Natural')]

  it('prefers the exact tag (normalizing underscores), then quality hints', () => {
    expect(pickVoice(voices, 'pt-PT')?.name).toBe('Joana')
    expect(pickVoice(voices, 'en-GB')?.name).toBe('Libby Natural')
  })
  it('falls back to the base language, or null', () => {
    expect(pickVoice([voice('pt-BR', 'Luciana'), voice('en-US')], 'pt-PT')?.name).toBe('Luciana')
    expect(pickVoice(voices, 'pl-PL')).toBeNull()
  })
})

describe('splitForSpeech', () => {
  it('keeps short text in one chunk and splits long text at sentence/word boundaries', () => {
    expect(splitForSpeech('  Olá,   tudo bem?  ')).toEqual(['Olá, tudo bem?'])
    expect(splitForSpeech('   ')).toEqual([])
    const long = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} of a long text.`).join(' ')
    const chunks = splitForSpeech(long, 120)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length > 0 && c.length <= 120)).toBe(true)
    expect(chunks.join(' ')).toBe(long)
  })
  it('splits a single huge sentence by words', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const chunks = splitForSpeech(words, 50)
    expect(chunks.every((c) => c.length <= 50)).toBe(true)
    expect(chunks.join(' ')).toBe(words)
  })
})

describe('webSpeechSynthesizer', () => {
  it('speaks every chunk with the speech tag and best voice, then ends once', () => {
    const f = fakeEngine([voice('it-IT', 'Alice'), voice('en-GB')])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    const h = handlers()
    tts.speak('Ciao! Come stai?', 'it', h)
    expect(f.synth.cancel).toHaveBeenCalledOnce()
    const u = f.spoken[0]
    expect(u?.lang).toBe('it-IT')
    expect(u?.voice?.name).toBe('Alice')
    u?.onstart?.()
    expect(h.onStart).toHaveBeenCalledOnce()
    u?.onend?.()
    expect(h.onEnd).toHaveBeenCalledOnce()
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('waits for voiceschanged when the voice list is empty', () => {
    const f = fakeEngine([])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    tts.speak('Hallo', 'de', handlers())
    expect(f.spoken).toHaveLength(0)
    f.setVoices([voice('de-DE', 'Anna')])
    expect(f.spoken[0]?.voice?.name).toBe('Anna')
  })

  it('speaks without a voice after the voices timeout', () => {
    vi.useFakeTimers()
    const f = fakeEngine([])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine, voicesTimeoutMs: 1500 })
    tts.speak('Cześć', 'pl', handlers())
    vi.advanceTimersByTime(1500)
    expect(f.spoken[0]?.lang).toBe('pl-PL')
    expect(f.spoken[0]?.voice).toBeNull()
  })

  it('a new speak() silences the previous one; cancel() silences everything', () => {
    const f = fakeEngine([voice('en-GB')])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    const first = handlers()
    tts.speak('First', 'en', first)
    const second = handlers()
    const pb = tts.speak('Second', 'en', second)
    f.spoken[0]?.onerror?.({ error: 'interrupted' })
    f.spoken[0]?.onend?.()
    expect(first.onEnd).not.toHaveBeenCalled()
    expect(first.onError).not.toHaveBeenCalled()
    pb.cancel()
    expect(f.synth.cancel).toHaveBeenCalledTimes(3)
    f.spoken[1]?.onend?.()
    expect(second.onEnd).not.toHaveBeenCalled()
  })

  it('maps utterance errors', () => {
    const f = fakeEngine([voice('en-GB')])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    const h = handlers()
    tts.speak('Hello', 'en', h)
    f.spoken[0]?.onerror?.({ error: 'not-allowed' })
    expect(h.onError.mock.calls[0]?.[0].code).toBe('permission-denied')
    expect(mapSynthesisError('voice-unavailable')).toBe('not-supported')
    expect(mapSynthesisError('network', false)).toBe('offline')
  })

  it('watchdog advances when end never fires', () => {
    vi.useFakeTimers()
    const f = fakeEngine([voice('en-GB')])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    const h = handlers()
    tts.speak('Hello', 'en', h)
    vi.advanceTimersByTime(60_000)
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('reports not-supported without an engine; warmUp speaks one silent utterance', async () => {
    const none = createWebSpeechSynthesizer({ getEngine: () => null })
    expect(none.isSupported()).toBe(false)
    const h = handlers()
    none.speak('Hi', 'en', h)
    await Promise.resolve()
    expect(h.onError.mock.calls[0]?.[0].code).toBe('not-supported')

    const f = fakeEngine([voice('en-GB')])
    const tts = createWebSpeechSynthesizer({ getEngine: () => f.engine })
    tts.warmUp?.()
    tts.warmUp?.()
    expect(f.spoken).toHaveLength(1)
    expect(f.spoken[0]?.volume).toBe(0)
  })
})
