import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../errors'
import { createMockRecognizer } from './mockRecognizer'

function handlers() {
  return {
    onPartial: vi.fn<(text: string) => void>(),
    onFinal: vi.fn<(text: string) => void>(),
    onError: vi.fn<(err: AppError) => void>(),
    onEnd: vi.fn<() => void>(),
  }
}

describe('mockRecognizer (dev only)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hears the sample phrase word by word over ~2 s, like a real engine', () => {
    const h = handlers()
    createMockRecognizer().start({ language: 'it' }, h)
    vi.advanceTimersByTime(700)
    expect(h.onPartial).toHaveBeenCalled()
    expect(h.onFinal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1300)
    expect(h.onFinal).toHaveBeenCalledExactlyOnceWith("ciao dov'è la stazione dei treni più vicina")
    expect(h.onEnd).toHaveBeenCalledOnce()
  })

  it('stop() delivers what was heard so far; stopping before any word → no-speech', async () => {
    const r = createMockRecognizer({ phrases: { en: ['one two three four'] } })
    const early = handlers()
    r.start({ language: 'en' }, early).stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(early.onError.mock.calls[0]?.[0].code).toBe('no-speech')

    const h = handlers()
    const s = r.start({ language: 'en' }, h)
    vi.advanceTimersByTime(900) // 2 of 4 words (step = 400 ms)
    s.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.onFinal).toHaveBeenCalledExactlyOnceWith('one two')
  })

  it('abort() silences it and phrases cycle per language', () => {
    const r = createMockRecognizer({ phrases: { en: ['first', 'second'] } })
    const a = handlers()
    r.start({ language: 'en' }, a).abort()
    vi.advanceTimersByTime(5000)
    expect(a.onFinal).not.toHaveBeenCalled()
    expect(a.onError).not.toHaveBeenCalled()
    const b = handlers()
    r.start({ language: 'en' }, b)
    vi.advanceTimersByTime(5000)
    expect(b.onFinal).toHaveBeenCalledWith('second')
  })
})
