import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../errors'
import type { RecognitionHandlers } from './types'
import { createWebSpeechRecognizer, mapRecognitionError, type WebSpeechRecognition } from './webSpeechRecognizer'

class FakeRecognition implements WebSpeechRecognition {
  static instances: FakeRecognition[] = []
  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 5
  onresult: WebSpeechRecognition['onresult'] = null
  onerror: WebSpeechRecognition['onerror'] = null
  onend: WebSpeechRecognition['onend'] = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    FakeRecognition.instances.push(this)
  }
  emitResults(parts: [transcript: string, isFinal: boolean][]) {
    const results = parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))
    this.onresult?.({ results })
  }
  emitError(error: string) {
    this.onerror?.({ error })
  }
  emitEnd() {
    this.onend?.()
  }
}

function lastRec(): FakeRecognition {
  const rec = FakeRecognition.instances.at(-1)
  if (!rec) throw new Error('no recognition started')
  return rec
}

function handlers() {
  const h = {
    onPartial: vi.fn<(text: string) => void>(),
    onFinal: vi.fn<(text: string) => void>(),
    onError: vi.fn<(err: AppError) => void>(),
    onEnd: vi.fn<() => void>(),
  } satisfies RecognitionHandlers
  return h
}

const errorCode = (h: ReturnType<typeof handlers>) => h.onError.mock.calls[0]?.[0].code

describe('webSpeechRecognizer', () => {
  beforeEach(() => {
    FakeRecognition.instances = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const recognizer = createWebSpeechRecognizer({ getConstructor: () => FakeRecognition, stopGraceMs: 3000 })

  it('configures a single-utterance session with the BCP-47 speech tag', () => {
    recognizer.start({ language: 'pt-PT' }, handlers())
    const rec = lastRec()
    expect(rec.lang).toBe('pt-PT')
    expect(rec.continuous).toBe(false)
    expect(rec.interimResults).toBe(true)
    expect(rec.maxAlternatives).toBe(1)
    expect(rec.start).toHaveBeenCalledOnce()
  })

  it('emits partials, then the final transcript and onEnd once', () => {
    const h = handlers()
    recognizer.start({ language: 'it' }, h)
    const rec = lastRec()
    rec.emitResults([['ciao dove', false]])
    expect(h.onPartial).toHaveBeenLastCalledWith('ciao dove')
    rec.emitResults([["ciao dov'è la stazione", true]])
    rec.emitEnd()
    expect(h.onFinal).toHaveBeenCalledExactlyOnceWith("ciao dov'è la stazione")
    expect(h.onError).not.toHaveBeenCalled()
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('treats a session that ends without text as no-speech', () => {
    const h = handlers()
    recognizer.start({ language: 'en' }, h)
    lastRec().emitResults([['   ', true]])
    lastRec().emitEnd()
    expect(h.onFinal).not.toHaveBeenCalled()
    expect(errorCode(h)).toBe('no-speech')
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('maps engine errors and reports only once', () => {
    const h = handlers()
    recognizer.start({ language: 'en' }, h)
    lastRec().emitError('not-allowed')
    lastRec().emitEnd()
    expect(h.onError).toHaveBeenCalledOnce()
    expect(errorCode(h)).toBe('permission-denied')
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('maps the error vocabulary', () => {
    expect(mapRecognitionError('service-not-allowed')).toBe('permission-denied')
    expect(mapRecognitionError('no-speech')).toBe('no-speech')
    expect(mapRecognitionError('network', true)).toBe('unavailable')
    expect(mapRecognitionError('network', false)).toBe('offline')
    expect(mapRecognitionError('aborted')).toBe('aborted')
    expect(mapRecognitionError('language-not-supported')).toBe('not-supported')
    expect(mapRecognitionError('bad-grammar')).toBe('unknown')
  })

  it('audio-capture without any microphone → not-supported', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: () => Promise.resolve([]) } })
    try {
      const h = handlers()
      recognizer.start({ language: 'en' }, h)
      lastRec().emitError('audio-capture')
      await vi.waitFor(() => expect(h.onError).toHaveBeenCalled())
      expect(errorCode(h)).toBe('not-supported')
    } finally {
      if (original) Object.defineProperty(navigator, 'mediaDevices', original)
      else Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })

  it('keeps text heard before a late error', () => {
    const h = handlers()
    recognizer.start({ language: 'en' }, h)
    lastRec().emitResults([['hello there', false]])
    lastRec().emitError('network')
    expect(h.onFinal).toHaveBeenCalledWith('hello there')
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('abort() silences every handler', () => {
    const h = handlers()
    const session = recognizer.start({ language: 'en' }, h)
    const rec = lastRec()
    session.abort()
    expect(rec.abort).toHaveBeenCalledOnce()
    rec.emitResults([['late', true]])
    rec.emitError('aborted')
    rec.emitEnd()
    expect(h.onPartial).not.toHaveBeenCalled()
    expect(h.onFinal).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
    expect(h.onEnd).not.toHaveBeenCalled()
  })

  it('stop() finalizes with the interim text when the engine never fires end', () => {
    vi.useFakeTimers()
    const h = handlers()
    const session = recognizer.start({ language: 'en' }, h)
    lastRec().emitResults([['where is the station', false]])
    session.stop()
    expect(lastRec().stop).toHaveBeenCalledOnce()
    expect(h.onFinal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(h.onFinal).toHaveBeenCalledExactlyOnceWith('where is the station')
  })

  it('is unsupported without a constructor and reports it asynchronously', async () => {
    const none = createWebSpeechRecognizer({ getConstructor: () => null })
    expect(none.isSupported()).toBe(false)
    const h = handlers()
    none.start({ language: 'en' }, h)
    expect(h.onError).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(errorCode(h)).toBe('not-supported')
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('maps a start() NotAllowedError to permission-denied', async () => {
    class Throwing extends FakeRecognition {
      override start = vi.fn(() => {
        throw new DOMException('denied', 'NotAllowedError')
      })
    }
    const r = createWebSpeechRecognizer({ getConstructor: () => Throwing })
    const h = handlers()
    r.start({ language: 'en' }, h)
    await Promise.resolve()
    expect(errorCode(h)).toBe('permission-denied')
  })
})
