import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import {
  baseMimeType,
  createAudioRecorder,
  extensionForMimeType,
  mapGetUserMediaError,
  pickAudioMimeType,
  rmsToLevel,
  type AudioRecorderDeps,
  type RecordedAudio,
} from './recorder'

// ── fakes ─────────────────────────────────────────────────────────────────────

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  const stream = { getTracks: () => tracks } as unknown as MediaStream
  return { stream, tracks }
}

function makeMediaRecorder(supported: readonly string[]) {
  const instances: FakeMediaRecorder[] = []
  class FakeMediaRecorder {
    static isTypeSupported(type: string) {
      return supported.includes(type)
    }
    state: RecordingState = 'inactive'
    mimeType: string
    options: MediaRecorderOptions | undefined
    ondataavailable: ((event: BlobEvent) => void) | null = null
    onstop: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      this.options = options
      this.mimeType = options?.mimeType ?? 'audio/webm'
      instances.push(this)
    }
    start = vi.fn(() => {
      this.state = 'recording'
    })
    stop = vi.fn(() => {
      if (this.state === 'inactive') throw new DOMException('not recording', 'InvalidStateError')
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['voice-bytes'], { type: this.mimeType }) } as BlobEvent)
        this.onstop?.(new Event('stop'))
      })
    })
  }
  return { Recorder: FakeMediaRecorder as unknown as typeof MediaRecorder, instances }
}

function makeAudioContext(sample: { value: number }) {
  const contexts: { close: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; state: string }[] = []
  class FakeAudioContext {
    state = 'suspended'
    close = vi.fn(() => {
      this.state = 'closed'
      return Promise.resolve()
    })
    resume = vi.fn(() => Promise.resolve())
    constructor() {
      contexts.push(this)
    }
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() }
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        disconnect: vi.fn(),
        getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(sample.value),
      }
    }
  }
  return { AudioContext: FakeAudioContext as unknown as typeof AudioContext, contexts }
}

const CHROME = ['audio/webm;codecs=opus', 'audio/webm']
const SAFARI = ['audio/mp4']

function setup({ supported = CHROME, getUserMedia }: { supported?: readonly string[]; getUserMedia?: () => Promise<MediaStream> } = {}) {
  const clock = { now: 1000 }
  const media = fakeStream()
  const mr = makeMediaRecorder(supported)
  const sample = { value: 128 } // 128 = silence
  const ac = makeAudioContext(sample)
  const gum = vi.fn(getUserMedia ?? (() => Promise.resolve(media.stream)))
  const deps: AudioRecorderDeps = {
    mediaDevices: { getUserMedia: gum },
    MediaRecorder: mr.Recorder,
    AudioContext: ac.AudioContext,
    now: () => clock.now,
  }
  const recorder = createAudioRecorder(deps)
  const lastRecorder = () => {
    const r = mr.instances.at(-1)
    if (!r) throw new Error('no MediaRecorder created')
    return r
  }
  return { recorder, clock, media, gum, sample, contexts: ac.contexts, instances: mr.instances, lastRecorder }
}

beforeEach(() => {
  vi.useRealTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ── pure helpers ──────────────────────────────────────────────────────────────

describe('mime selection', () => {
  it('prefers WebM/Opus (Chrome/Edge/Android) and falls back to MP4 (Safari)', () => {
    expect(pickAudioMimeType((t) => CHROME.includes(t))).toBe('audio/webm;codecs=opus')
    expect(pickAudioMimeType((t) => SAFARI.includes(t))).toBe('audio/mp4')
    expect(pickAudioMimeType((t) => t === 'audio/mp4;codecs=mp4a.40.2' || t === 'audio/mp4')).toBe('audio/mp4;codecs=mp4a.40.2')
    expect(pickAudioMimeType((t) => t === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus')
  })

  it('returns null when nothing (or no isTypeSupported) is available, skipping throwing candidates', () => {
    expect(pickAudioMimeType(() => false)).toBeNull()
    expect(pickAudioMimeType(undefined)).toBeNull()
    const throwsOnOpus = (t: string) => {
      if (t.includes('opus')) throw new Error('bad codec string')
      return t === 'audio/webm'
    }
    expect(pickAudioMimeType(throwsOnOpus)).toBe('audio/webm')
  })

  it('normalises the container type and file extension', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMimeType('video/mp4')).toBe('audio/mp4')
    expect(extensionForMimeType('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForMimeType('audio/mp4')).toBe('m4a')
    expect(extensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg')
  })
})

describe('mapGetUserMediaError', () => {
  it('maps DOMException names to AppError codes', () => {
    expect(mapGetUserMediaError(new DOMException('no', 'NotAllowedError')).code).toBe('permission-denied')
    expect(mapGetUserMediaError(new DOMException('policy', 'SecurityError')).code).toBe('permission-denied')
    expect(mapGetUserMediaError(new DOMException('no mic', 'NotFoundError')).code).toBe('not-supported')
    expect(mapGetUserMediaError(new DOMException('busy', 'NotReadableError')).code).toBe('unknown')
    expect(mapGetUserMediaError('weird').code).toBe('unknown')
  })
})

describe('rmsToLevel', () => {
  it('maps −60…−10 dBFS to 0…1', () => {
    expect(rmsToLevel(0)).toBe(0)
    expect(rmsToLevel(0.001)).toBe(0) // −60 dB
    expect(rmsToLevel(1)).toBe(1)
    expect(rmsToLevel(0.0316)).toBeCloseTo(0.6, 2) // −30 dB
  })
})

// ── recorder ──────────────────────────────────────────────────────────────────

describe('createAudioRecorder', () => {
  it('records WebM/Opus with echo cancellation and noise suppression, then releases the mic', async () => {
    const { recorder, clock, media, gum, contexts, lastRecorder } = setup()
    expect(recorder.isSupported()).toBe(true)
    await recorder.start()
    expect(gum).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } })
    expect(lastRecorder().options).toEqual({ mimeType: 'audio/webm;codecs=opus' })
    expect(lastRecorder().start).toHaveBeenCalledOnce()
    expect(recorder.state()).toBe('recording')
    expect(contexts[0]?.resume).toHaveBeenCalled() // created inside the gesture and resumed (iOS)

    clock.now += 2500
    expect(recorder.elapsedMs()).toBe(2500)
    const audio = await recorder.stop()
    expect(audio).toMatchObject({ mimeType: 'audio/webm', extension: 'webm', durationMs: 2500 })
    expect(audio.blob.size).toBeGreaterThan(0)
    expect(audio.blob.type).toBe('audio/webm')
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(contexts[0]?.close).toHaveBeenCalled()
    expect(recorder.state()).toBe('inactive')
    expect(recorder.elapsedMs()).toBe(2500)
  })

  it('uses audio/mp4 (.m4a) on Safari', async () => {
    const { recorder, clock } = setup({ supported: SAFARI })
    await recorder.start()
    clock.now += 1200
    const audio = await recorder.stop()
    expect(audio).toMatchObject({ mimeType: 'audio/mp4', extension: 'm4a', durationMs: 1200 })
  })

  it('rejects recordings shorter than 500 ms with invalid-input and still cleans up', async () => {
    const { recorder, clock, media } = setup()
    await recorder.start()
    clock.now += 300
    await expect(recorder.stop()).rejects.toMatchObject({ code: 'invalid-input' })
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(recorder.state()).toBe('inactive')
  })

  it('cancel() discards the take, stops tracks and closes the AudioContext', async () => {
    const { recorder, clock, media, contexts, lastRecorder } = setup()
    const autoStop = vi.fn()
    recorder.onAutoStop(autoStop)
    await recorder.start()
    clock.now += 3000
    recorder.cancel()
    expect(lastRecorder().stop).toHaveBeenCalled()
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(contexts[0]?.close).toHaveBeenCalled()
    expect(recorder.state()).toBe('inactive')
    await Promise.resolve()
    expect(autoStop).not.toHaveBeenCalled()
    await expect(recorder.stop()).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('cancel() while the permission prompt is open aborts start and stops the late stream', async () => {
    const media = fakeStream()
    let grant: (s: MediaStream) => void = () => {}
    const { recorder, instances } = setup({ getUserMedia: () => new Promise<MediaStream>((resolve) => (grant = resolve)) })
    const starting = recorder.start()
    expect(recorder.state()).toBe('starting')
    recorder.cancel()
    grant(media.stream)
    await expect(starting).rejects.toMatchObject({ code: 'aborted' })
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(instances).toHaveLength(0)
  })

  it('maps permission errors and closes the AudioContext', async () => {
    const denied = setup({ getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) })
    await expect(denied.recorder.start()).rejects.toMatchObject({ code: 'permission-denied' })
    expect(denied.contexts[0]?.close).toHaveBeenCalled()
    expect(denied.recorder.state()).toBe('inactive')

    const noMic = setup({ getUserMedia: () => Promise.reject(new DOMException('none', 'NotFoundError')) })
    await expect(noMic.recorder.start()).rejects.toMatchObject({ code: 'not-supported' })

    const busy = setup({ getUserMedia: () => Promise.reject(new DOMException('busy', 'NotReadableError')) })
    await expect(busy.recorder.start()).rejects.toMatchObject({ code: 'unknown' })
  })

  it('is unsupported without MediaRecorder or getUserMedia', async () => {
    const recorder = createAudioRecorder({ mediaDevices: { getUserMedia: vi.fn() }, MediaRecorder: undefined, AudioContext: null })
    // MediaRecorder: undefined falls back to the global, which jsdom does not have
    expect(recorder.isSupported()).toBe(false)
    await expect(recorder.start()).rejects.toBeInstanceOf(AppError)
    await expect(recorder.start()).rejects.toMatchObject({ code: 'not-supported' })
  })

  it('rejects a second start while recording', async () => {
    const { recorder, gum } = setup()
    await recorder.start()
    await expect(recorder.start()).rejects.toMatchObject({ code: 'invalid-input' })
    expect(gum).toHaveBeenCalledOnce()
    recorder.cancel()
  })

  it('auto-stops at the max duration and hands the recording to onAutoStop', async () => {
    vi.useFakeTimers()
    const { recorder, clock, media } = setup()
    const results: Promise<RecordedAudio>[] = []
    recorder.onAutoStop((result) => results.push(result))
    await recorder.start({ maxDurationMs: 5000 })
    clock.now += 5000
    vi.advanceTimersByTime(5000)
    expect(results).toHaveLength(1)
    const audio = await results[0]
    expect(audio?.durationMs).toBe(5000)
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    // stop() after the auto-stop does not produce a second recording
    await expect(recorder.stop()).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('defaults to a 2-minute limit', async () => {
    vi.useFakeTimers()
    const { recorder, clock } = setup()
    const autoStop = vi.fn()
    recorder.onAutoStop(autoStop)
    await recorder.start()
    clock.now += 119_999
    vi.advanceTimersByTime(119_999)
    expect(autoStop).not.toHaveBeenCalled()
    clock.now += 1
    vi.advanceTimersByTime(1)
    expect(autoStop).toHaveBeenCalledOnce()
  })

  it('treats a recorder that stops on its own (mic unplugged) as an auto-stop', async () => {
    const { recorder, clock, lastRecorder } = setup()
    const results: Promise<RecordedAudio>[] = []
    recorder.onAutoStop((result) => results.push(result))
    await recorder.start()
    clock.now += 1500
    lastRecorder().stop()
    await vi.waitFor(() => expect(results).toHaveLength(1))
    await expect(results[0]).resolves.toMatchObject({ durationMs: 1500 })
  })

  it('emits live levels (~20 fps) while recording and 0 when it ends', async () => {
    vi.useFakeTimers()
    const { recorder, clock, sample } = setup()
    const levels: number[] = []
    const unsubscribe = recorder.onLevel((level) => levels.push(level))
    await recorder.start()
    vi.advanceTimersByTime(50)
    expect(levels.at(-1)).toBe(0) // silence
    sample.value = 200 // loud constant signal
    vi.advanceTimersByTime(50)
    expect(levels.at(-1)).toBeGreaterThan(0.8)
    vi.advanceTimersByTime(1000)
    expect(levels.length).toBeGreaterThanOrEqual(20)
    clock.now += 1200
    const stopping = recorder.stop()
    expect(levels.at(-1)).toBe(0)
    await stopping
    const count = levels.length
    vi.advanceTimersByTime(500)
    expect(levels.length).toBe(count) // meter stopped
    unsubscribe()
  })
})
