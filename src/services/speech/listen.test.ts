import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { listen } from './listen'
import type { RecognitionHandlers, SpeechRecognizer } from './types'

function fakeRecognizer(supported = true) {
  const sessions: { handlers: RecognitionHandlers; stop: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] = []
  const recognizer: SpeechRecognizer = {
    isSupported: () => supported,
    start(_opts, handlers) {
      const s = { handlers, stop: vi.fn(), abort: vi.fn() }
      sessions.push(s)
      return { stop: s.stop, abort: s.abort }
    },
  }
  const last = () => {
    const s = sessions.at(-1)
    if (!s) throw new Error('not started')
    return s
  }
  return { recognizer, sessions, last }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('listen', () => {
  it('resolves with the trimmed final transcript and forwards partials', async () => {
    const f = fakeRecognizer()
    const onPartial = vi.fn()
    const handle = listen(f.recognizer, { language: 'en', onPartial })
    f.last().handlers.onPartial?.('hel')
    f.last().handlers.onFinal('  hello  ')
    await expect(handle.result).resolves.toBe('hello')
    expect(onPartial).toHaveBeenCalledWith('hel')
  })

  it('rejects with the recognizer error', async () => {
    const f = fakeRecognizer()
    const handle = listen(f.recognizer, { language: 'en' })
    f.last().handlers.onError(new AppError('permission-denied'))
    await expect(handle.result).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('auto-stops after the max duration', () => {
    vi.useFakeTimers()
    const f = fakeRecognizer()
    listen(f.recognizer, { language: 'en', maxDurationMs: 15_000 }).result.catch(() => {})
    vi.advanceTimersByTime(14_999)
    expect(f.last().stop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f.last().stop).toHaveBeenCalledOnce()
  })

  it('abort() rejects with aborted and aborts the session', async () => {
    const f = fakeRecognizer()
    const handle = listen(f.recognizer, { language: 'en' })
    handle.abort()
    await expect(handle.result).rejects.toMatchObject({ code: 'aborted' })
    expect(f.last().abort).toHaveBeenCalledOnce()
  })

  it('does not start an unsupported recognizer', async () => {
    const f = fakeRecognizer(false)
    await expect(listen(f.recognizer, { language: 'en' }).result).rejects.toMatchObject({ code: 'not-supported' })
    expect(f.sessions).toHaveLength(0)
  })
})
