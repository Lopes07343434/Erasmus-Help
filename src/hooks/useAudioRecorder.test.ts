import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioRecorder, RecordedAudio } from '@/services/audio'
import { AppError } from '@/services/errors'
import { useAudioRecorder, type UseAudioRecorderOptions } from './useAudioRecorder'

vi.mock('@/services/speech/microphone', () => ({
  getMicrophonePermission: vi.fn(() => Promise.resolve('prompt')),
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (err: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const AUDIO: RecordedAudio = { blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 3000, extension: 'webm' }

function fakeRecorder(supported = true) {
  const levelListeners = new Set<(level: number) => void>()
  const autoStopListeners = new Set<(result: Promise<RecordedAudio>) => void>()
  const starts: Deferred<void>[] = []
  const stops: Deferred<RecordedAudio>[] = []
  let elapsed = 0
  const recorder: AudioRecorder = {
    isSupported: () => supported,
    start: vi.fn(() => {
      const d = deferred<void>()
      starts.push(d)
      return d.promise
    }),
    stop: vi.fn(() => {
      const d = deferred<RecordedAudio>()
      stops.push(d)
      return d.promise
    }),
    cancel: vi.fn(),
    onLevel: (cb) => {
      levelListeners.add(cb)
      return () => levelListeners.delete(cb)
    },
    onAutoStop: (cb) => {
      autoStopListeners.add(cb)
      return () => autoStopListeners.delete(cb)
    },
    elapsedMs: () => elapsed,
    state: () => 'inactive',
  }
  return {
    recorder,
    starts,
    stops,
    setElapsed: (ms: number) => {
      elapsed = ms
    },
    emitLevel: (level: number) => levelListeners.forEach((cb) => cb(level)),
    autoStop: (result: Promise<RecordedAudio>) => autoStopListeners.forEach((cb) => cb(result)),
  }
}

async function setup(options: Partial<UseAudioRecorderOptions> = {}, supported = true) {
  const fake = fakeRecorder(supported)
  const hook = renderHook(() => useAudioRecorder({ recorder: fake.recorder, historySize: 8, ...options }))
  await act(async () => {}) // permission read on mount
  return { ...hook, fake }
}

async function startRecording(result: { current: ReturnType<typeof useAudioRecorder> }, fake: ReturnType<typeof fakeRecorder>) {
  act(() => result.current.start())
  await act(async () => fake.starts.at(-1)?.resolve())
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useAudioRecorder', () => {
  it('goes idle → requesting → recording and reads the real permission state', async () => {
    const { result, fake } = await setup()
    expect(result.current.status).toBe('idle')
    expect(result.current.permission).toBe('prompt')
    expect(result.current.isSupported).toBe(true)
    expect(result.current.maxDurationMs).toBe(120_000)

    act(() => result.current.start())
    expect(result.current.status).toBe('requesting')
    expect(fake.recorder.start).toHaveBeenCalledWith({ maxDurationMs: 120_000 })
    await act(async () => fake.starts[0]?.resolve())
    expect(result.current.status).toBe('recording')
    expect(result.current.permission).toBe('granted')
  })

  it('prevents double starts', async () => {
    const { result, fake } = await setup()
    act(() => {
      result.current.start()
      result.current.start()
    })
    act(() => result.current.start())
    expect(fake.recorder.start).toHaveBeenCalledOnce()
  })

  it('updates elapsed time ~4×/s and keeps a level history for the meter', async () => {
    vi.useFakeTimers()
    const { result, fake } = await setup()
    await startRecording(result, fake)
    expect(result.current.levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0])

    fake.setElapsed(1250)
    act(() => {
      fake.emitLevel(0.3)
      fake.emitLevel(0.6) // peak between UI ticks wins
      vi.advanceTimersByTime(250)
    })
    expect(result.current.elapsedMs).toBe(1250)
    expect(result.current.levels.at(-2)).toBe(0.6)
    expect(result.current.levels.at(-1)).toBe(0) // next tick had no samples
    expect(result.current.levels).toHaveLength(8)
  })

  it('stop() resolves with the recording once; a second call returns null', async () => {
    const { result, fake } = await setup()
    await startRecording(result, fake)
    let first: Promise<RecordedAudio | null> = Promise.resolve(null)
    let second: Promise<RecordedAudio | null> = Promise.resolve(null)
    act(() => {
      first = result.current.stop()
      second = result.current.stop()
    })
    expect(result.current.status).toBe('stopping')
    await act(async () => fake.stops[0]?.resolve(AUDIO))
    await expect(first).resolves.toBe(AUDIO)
    await expect(second).resolves.toBeNull()
    expect(fake.recorder.stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('idle')
  })

  it('cancel() discards the take and returns to idle', async () => {
    const { result, fake } = await setup()
    await startRecording(result, fake)
    act(() => result.current.cancel())
    expect(fake.recorder.cancel).toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    await expect(result.current.stop()).resolves.toBeNull()
  })

  it('cancel() while the permission prompt is open ignores the late result', async () => {
    const { result, fake } = await setup()
    act(() => result.current.start())
    act(() => result.current.cancel())
    await act(async () => fake.starts[0]?.reject(new AppError('aborted')))
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('surfaces permission-denied and too-short recordings as errors', async () => {
    const { result, fake } = await setup()
    act(() => result.current.start())
    await act(async () => fake.starts[0]?.reject(new AppError('permission-denied')))
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('permission-denied')

    act(() => result.current.clearError())
    expect(result.current.status).toBe('idle')

    await startRecording(result, fake)
    let out: Promise<RecordedAudio | null> = Promise.resolve(AUDIO)
    act(() => {
      out = result.current.stop()
    })
    await act(async () => fake.stops[0]?.reject(new AppError('invalid-input')))
    await expect(out).resolves.toBeNull()
    expect(result.current.error?.code).toBe('invalid-input')
  })

  it('unsupported browsers fail with not-supported without touching the recorder', async () => {
    const { result, fake } = await setup({}, false)
    expect(result.current.isSupported).toBe(false)
    act(() => result.current.start())
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('not-supported')
    expect(fake.recorder.start).not.toHaveBeenCalled()
  })

  it('delivers an auto-stopped recording (max duration) through onAutoStop exactly once', async () => {
    const onAutoStop = vi.fn()
    const { result, fake } = await setup({ onAutoStop, maxDurationMs: 60_000 })
    act(() => result.current.start())
    expect(fake.recorder.start).toHaveBeenCalledWith({ maxDurationMs: 60_000 })
    await act(async () => fake.starts[0]?.resolve())

    const auto = deferred<RecordedAudio>()
    act(() => fake.autoStop(auto.promise))
    expect(result.current.status).toBe('stopping')
    let manual: Promise<RecordedAudio | null> = Promise.resolve(AUDIO)
    act(() => {
      manual = result.current.stop() // user taps send at the same moment
    })
    await act(async () => auto.resolve(AUDIO))
    expect(onAutoStop).toHaveBeenCalledExactlyOnceWith(AUDIO)
    await expect(manual).resolves.toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('cancels the recorder on unmount', async () => {
    const { result, fake, unmount } = await setup()
    await startRecording(result, fake)
    unmount()
    expect(fake.recorder.cancel).toHaveBeenCalled()
  })
})
