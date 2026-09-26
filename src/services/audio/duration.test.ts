import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import { formatDuration, getAudioDuration, mediaErrorToAppError, readMediaDurationMs } from './duration'

class FakeMedia extends EventTarget {
  src = ''
  preload = ''
  duration = Number.NaN
  error: { code: number } | null = null
  private time = 0
  seeks: number[] = []
  load = vi.fn()
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = ''
  })
  get currentTime() {
    return this.time
  }
  set currentTime(v: number) {
    this.time = v
    this.seeks.push(v)
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type))
  }
}

const asAudio = (m: FakeMedia) => m as unknown as HTMLAudioElement

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7000)).toBe('0:07')
    expect(formatDuration(7999)).toBe('0:07')
    expect(formatDuration(102_000)).toBe('1:42')
    expect(formatDuration(725_000)).toBe('12:05')
  })

  it('rounds to the nearest second when asked (totals)', () => {
    expect(formatDuration(6600, 'round')).toBe('0:07')
    expect(formatDuration(6400, 'round')).toBe('0:06')
  })

  it('treats invalid values as 0:00', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00')
    expect(formatDuration(-5000)).toBe('0:00')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('readMediaDurationMs / mediaErrorToAppError', () => {
  it('only accepts finite positive durations', () => {
    expect(readMediaDurationMs({ duration: Number.POSITIVE_INFINITY })).toBeNull()
    expect(readMediaDurationMs({ duration: Number.NaN })).toBeNull()
    expect(readMediaDurationMs({ duration: 1.5 })).toBe(1500)
  })

  it('maps media error codes', () => {
    expect(mediaErrorToAppError({ code: 4 }).code).toBe('not-supported')
    expect(mediaErrorToAppError({ code: 3 }).code).toBe('not-supported')
    expect(mediaErrorToAppError({ code: 2 }).code).toBe('unavailable')
    expect(mediaErrorToAppError({ code: 1 }).code).toBe('aborted')
    expect(mediaErrorToAppError(null).code).toBe('unknown')
  })
})

describe('getAudioDuration', () => {
  it('returns the recorder-measured duration without touching the media', async () => {
    const createAudio = vi.fn()
    await expect(getAudioDuration('https://x/a.webm', { knownDurationMs: 4321.4, createAudio })).resolves.toBe(4321)
    expect(createAudio).not.toHaveBeenCalled()
  })

  it('reads a finite duration from metadata', async () => {
    const media = new FakeMedia()
    const promise = getAudioDuration('https://x/a.m4a', { createAudio: () => asAudio(media) })
    expect(media.src).toBe('https://x/a.m4a')
    media.duration = 7.25
    media.fire('loadedmetadata')
    await expect(promise).resolves.toBe(7250)
    expect(media.src).toBe('') // released
  })

  it('fixes Chrome WebM Infinity by seeking to a huge currentTime', async () => {
    const media = new FakeMedia()
    const promise = getAudioDuration('https://x/a.webm', { createAudio: () => asAudio(media) })
    media.duration = Number.POSITIVE_INFINITY
    media.fire('loadedmetadata')
    expect(media.seeks).toEqual([1e101])
    media.duration = 3.2
    media.fire('durationchange')
    await expect(promise).resolves.toBe(3200)
  })

  it('creates and revokes an object URL for Blobs', async () => {
    const createObjectURL = vi.fn(() => 'blob:local/1')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const media = new FakeMedia()
    const promise = getAudioDuration(new Blob(['x'], { type: 'audio/webm' }), { createAudio: () => asAudio(media) })
    expect(media.src).toBe('blob:local/1')
    media.duration = 1
    media.fire('loadedmetadata')
    await expect(promise).resolves.toBe(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local/1')
  })

  it('rejects with not-supported on an undecodable file and timeout when nothing happens', async () => {
    const media = new FakeMedia()
    const failing = getAudioDuration('https://x/a.webm', { createAudio: () => asAudio(media) })
    media.error = { code: 4 }
    media.fire('error')
    await expect(failing).rejects.toMatchObject({ code: 'not-supported' })

    vi.useFakeTimers()
    const slow = getAudioDuration('https://x/b.webm', { createAudio: () => asAudio(new FakeMedia()), timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    await expect(slow).rejects.toBeInstanceOf(AppError)
    await expect(slow).rejects.toMatchObject({ code: 'timeout' })
  })
})
