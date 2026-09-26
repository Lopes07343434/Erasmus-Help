import { AppError } from '@/services/errors'

/**
 * Voice-message recorder (MediaRecorder + getUserMedia) for the chat composer.
 *
 * - Container/codec: the first entry of AUDIO_MIME_CANDIDATES the browser can record. Chrome/Edge/Firefox/Android →
 *   WebM/Opus; Safari < 18.4 → MP4/AAC (Safari 18.4+ also records WebM/Opus, which iOS ≥ 17.4 plays).
 * - Live level (0..1) for a meter via an AnalyserNode (RMS in dB, ~20 fps). Metering is best-effort: without
 *   Web Audio the recording still works and the level stays 0.
 * - Resources (mic tracks, AudioContext, timers) are always released on stop / cancel / error / auto-stop.
 * - Nothing is persisted: the caller gets a Blob in memory (upload is the chat data layer's job).
 */

export type AudioExtension = 'webm' | 'm4a' | 'ogg'

export interface RecordedAudio {
  blob: Blob
  /** Container type without codec parameters ('audio/webm' | 'audio/mp4' | 'audio/ogg'): use it as the upload Content-Type. */
  mimeType: string
  /** Measured by the recorder (wall clock between start and stop). Store it with the message: Chrome WebM files have no duration header. */
  durationMs: number
  extension: AudioExtension
}

export interface AudioRecorderStartOptions {
  /** Auto-stop after this long (default 120 000 ms = 2 min). */
  maxDurationMs?: number
}

export type AudioRecorderState = 'inactive' | 'starting' | 'recording' | 'stopping'

export interface AudioRecorder {
  /** MediaRecorder + getUserMedia available (false on insecure origins and very old browsers). */
  isSupported(): boolean
  /**
   * Asks for the microphone and starts recording. Call from a user gesture (click).
   * Rejects with AppError: not-supported | permission-denied | aborted (cancelled while asking) | invalid-input (already started) | unknown.
   */
  start(opts?: AudioRecorderStartOptions): Promise<void>
  /**
   * Stops and returns the recording. Rejects with AppError('invalid-input') when shorter than MIN_AUDIO_DURATION_MS
   * (or empty), 'aborted' if cancelled meanwhile. Calling it again while stopping returns the same promise.
   */
  stop(): Promise<RecordedAudio>
  /** Discards the recording (also while the permission prompt is open) and releases the microphone. */
  cancel(): void
  /** Live input level 0..1 (~20 fps while recording, 0 when it ends). Returns an unsubscribe function. */
  onLevel(cb: (level: number) => void): () => void
  /**
   * The recording ended without stop(): max duration reached, microphone lost, or recorder error.
   * The callback gets the result promise (resolves like stop(), or rejects). Returns an unsubscribe function.
   */
  onAutoStop(cb: (result: Promise<RecordedAudio>) => void): () => void
  /** Milliseconds recorded so far (frozen once stopped). */
  elapsedMs(): number
  state(): AudioRecorderState
}

/** Test/DI seams. Omitted fields fall back to the browser globals (read at call time). */
export interface AudioRecorderDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>
  MediaRecorder?: typeof MediaRecorder
  /** `null` disables level metering. */
  AudioContext?: typeof AudioContext | null
  now?: () => number
  mimeTypes?: readonly string[]
  levelIntervalMs?: number
}

/** Preference order. WebM/Opus first (small, Chrome/Edge/Android/Firefox); MP4/AAC for Safari; Ogg last (old Firefox). */
export const AUDIO_MIME_CANDIDATES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

export const DEFAULT_MAX_AUDIO_DURATION_MS = 120_000
export const MIN_AUDIO_DURATION_MS = 500
const LEVEL_INTERVAL_MS = 50
/** Some engines never fire `stop` after an error/track loss: finish with what we have after this. */
const STOP_FALLBACK_MS = 3000

/** First candidate the recorder can produce, or null (let the browser choose). */
export function pickAudioMimeType(isTypeSupported: ((type: string) => boolean) | undefined, candidates: readonly string[] = AUDIO_MIME_CANDIDATES): string | null {
  if (typeof isTypeSupported !== 'function') return null
  for (const type of candidates) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      // some engines throw on unknown codec strings: try the next one
    }
  }
  return null
}

/** 'audio/webm;codecs=opus' → 'audio/webm'. Safari may report 'video/mp4' for audio-only streams → 'audio/mp4'. */
export function baseMimeType(type: string): string {
  const base = (type.split(';')[0] ?? '').trim().toLowerCase()
  return base.startsWith('video/') ? `audio/${base.slice('video/'.length)}` : base
}

export function extensionForMimeType(type: string): AudioExtension {
  const base = baseMimeType(type)
  if (base.includes('mp4') || base.includes('m4a') || base.includes('aac')) return 'm4a'
  if (base.includes('ogg')) return 'ogg'
  return 'webm'
}

/** getUserMedia failures → AppError codes the UI knows how to explain. */
export function mapGetUserMediaError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const name = typeof err === 'object' && err !== null && 'name' in err && typeof err.name === 'string' ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // legacy Chrome
    case 'SecurityError': // blocked by permissions policy / insecure context
      return new AppError('permission-denied', err)
    case 'NotFoundError':
    case 'DevicesNotFoundError': // legacy Chrome
    case 'OverconstrainedError':
      return new AppError('not-supported', err)
    default:
      return new AppError('unknown', err)
  }
}

/** RMS amplitude (0..1) → perceptual level 0..1: −60 dBFS (room noise) → 0, −10 dBFS (loud speech) → 1. */
export function rmsToLevel(rms: number): number {
  if (!(rms > 0)) return 0
  const db = 20 * Math.log10(rms)
  return Math.min(1, Math.max(0, (db + 60) / 50))
}

function resolveAudioContext(deps: AudioRecorderDeps): typeof AudioContext | null {
  if (deps.AudioContext !== undefined) return deps.AudioContext
  if (typeof AudioContext !== 'undefined') return AudioContext
  if (typeof window === 'undefined') return null
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null
}

interface Session {
  cancelled: boolean
  finished: boolean
  stream: MediaStream | null
  recorder: MediaRecorder | null
  ctx: AudioContext | null
  stopMeter: (() => void) | null
  chunks: Blob[]
  requestedMime: string | null
  startedAt: number | null
  endedAt: number | null
  maxTimer: ReturnType<typeof setTimeout> | null
  fallbackTimer: ReturnType<typeof setTimeout> | null
  stopPromise: Promise<RecordedAudio> | null
  /** Set while stopping: completes the stop promise from the recorder's `stop` event. */
  complete: (() => void) | null
  fail: ((err: AppError) => void) | null
}

export function createAudioRecorder(deps: AudioRecorderDeps = {}): AudioRecorder {
  const now = deps.now ?? (() => performance.now())
  const levelListeners = new Set<(level: number) => void>()
  const autoStopListeners = new Set<(result: Promise<RecordedAudio>) => void>()
  let current: Session | null = null
  let state: AudioRecorderState = 'inactive'
  let lastElapsed = 0

  const mediaDevices = () => deps.mediaDevices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined)
  const Recorder = () => deps.MediaRecorder ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined)

  const emitLevel = (level: number) => {
    for (const cb of levelListeners) cb(level)
  }

  const elapsedOf = (s: Session) => (s.startedAt === null ? 0 : Math.max(0, (s.endedAt ?? now()) - s.startedAt))

  /** Releases everything the session holds. Idempotent. */
  const teardown = (s: Session) => {
    s.finished = true
    if (s.maxTimer !== null) clearTimeout(s.maxTimer)
    if (s.fallbackTimer !== null) clearTimeout(s.fallbackTimer)
    s.maxTimer = s.fallbackTimer = null
    s.stopMeter?.()
    s.stopMeter = null
    if (s.recorder) {
      s.recorder.ondataavailable = null
      s.recorder.onstop = null
      s.recorder.onerror = null
    }
    s.stream?.getTracks().forEach((track) => track.stop())
    s.stream = null
    const ctx = s.ctx
    s.ctx = null
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
    s.complete = s.fail = null
    if (current === s) {
      lastElapsed = elapsedOf(s)
      current = null
      state = 'inactive'
      emitLevel(0)
    }
  }

  const startMeter = (s: Session, ctx: AudioContext, stream: MediaStream) => {
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buffer = new Uint8Array(analyser.fftSize)
    let smoothed = 0
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (const v of buffer) {
        const x = (v - 128) / 128
        sum += x * x
      }
      const level = rmsToLevel(Math.sqrt(sum / buffer.length))
      // fast attack, slow release: the meter does not flicker between syllables
      smoothed = level >= smoothed ? level : smoothed * 0.75 + level * 0.25
      emitLevel(smoothed)
    }, deps.levelIntervalMs ?? LEVEL_INTERVAL_MS)
    s.stopMeter = () => {
      clearInterval(timer)
      try {
        source.disconnect()
        analyser.disconnect()
      } catch {
        // already disconnected
      }
    }
  }

  /** Stops the MediaRecorder (if still running) and resolves with the recording once its `stop` event fires. */
  const finalize = (s: Session): Promise<RecordedAudio> => {
    if (s.stopPromise) return s.stopPromise
    state = 'stopping'
    s.endedAt = now()
    if (s.maxTimer !== null) clearTimeout(s.maxTimer)
    s.maxTimer = null
    s.stopMeter?.()
    s.stopMeter = null
    emitLevel(0)

    s.stopPromise = new Promise<RecordedAudio>((resolve, reject) => {
      const recorder = s.recorder
      s.fail = (err) => {
        teardown(s)
        reject(err)
      }
      s.complete = () => {
        const durationMs = elapsedOf(s)
        const reported = recorder?.mimeType || s.requestedMime || s.chunks[0]?.type || 'audio/webm'
        const mimeType = baseMimeType(reported) || 'audio/webm'
        const blob = new Blob(s.chunks, { type: mimeType })
        teardown(s)
        if (durationMs < MIN_AUDIO_DURATION_MS || blob.size === 0) reject(new AppError('invalid-input'))
        else resolve({ blob, mimeType, durationMs, extension: extensionForMimeType(mimeType) })
      }
      if (!recorder || recorder.state === 'inactive') {
        s.complete()
        return
      }
      s.fallbackTimer = setTimeout(() => s.complete?.(), STOP_FALLBACK_MS)
      try {
        recorder.stop()
      } catch (err) {
        s.fail(new AppError('unknown', err))
      }
    })
    return s.stopPromise
  }

  const notifyAutoStop = (result: Promise<RecordedAudio>) => {
    result.catch(() => {}) // listeners handle it; never an unhandled rejection
    for (const cb of autoStopListeners) cb(result)
  }

  const cancel = () => {
    const s = current
    if (!s) return
    s.cancelled = true
    const recorder = s.recorder
    const fail = s.fail
    teardown(s) // detaches handlers first: the discarded data never reaches a listener
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // already stopping
      }
    }
    fail?.(new AppError('aborted'))
  }

  return {
    isSupported() {
      return typeof mediaDevices()?.getUserMedia === 'function' && typeof Recorder() === 'function'
    },

    async start(opts = {}) {
      if (current) throw new AppError('invalid-input')
      const devices = mediaDevices()
      const RecorderCtor = Recorder()
      if (typeof devices?.getUserMedia !== 'function' || typeof RecorderCtor !== 'function') throw new AppError('not-supported')
      const maxDurationMs = opts.maxDurationMs ?? DEFAULT_MAX_AUDIO_DURATION_MS

      const s: Session = {
        cancelled: false,
        finished: false,
        stream: null,
        recorder: null,
        ctx: null,
        stopMeter: null,
        chunks: [],
        requestedMime: null,
        startedAt: null,
        endedAt: null,
        maxTimer: null,
        fallbackTimer: null,
        stopPromise: null,
        complete: null,
        fail: null,
      }
      current = s
      state = 'starting'
      lastElapsed = 0

      // Create/resume the AudioContext synchronously, still inside the click (iOS Safari keeps it suspended otherwise).
      const Ctx = resolveAudioContext(deps)
      if (Ctx) {
        try {
          s.ctx = new Ctx()
          if (s.ctx.state === 'suspended') s.ctx.resume().catch(() => {})
        } catch {
          s.ctx = null // metering is optional
        }
      }

      let stream: MediaStream
      try {
        stream = await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      } catch (err) {
        const cancelled = s.cancelled
        teardown(s)
        throw cancelled ? new AppError('aborted', err) : mapGetUserMediaError(err)
      }
      if (s.cancelled || s.finished) {
        stream.getTracks().forEach((track) => track.stop())
        teardown(s)
        throw new AppError('aborted')
      }
      s.stream = stream

      const mimeType = pickAudioMimeType((type) => RecorderCtor.isTypeSupported(type), deps.mimeTypes)
      s.requestedMime = mimeType
      let recorder: MediaRecorder
      try {
        recorder = mimeType ? new RecorderCtor(stream, { mimeType }) : new RecorderCtor(stream)
      } catch (err) {
        teardown(s)
        throw new AppError('not-supported', err)
      }
      s.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) s.chunks.push(event.data)
      }
      recorder.onstop = () => {
        if (s.finished) return
        if (s.complete) s.complete()
        else notifyAutoStop(finalize(s)) // stopped on its own (track ended / device lost)
      }
      recorder.onerror = (event) => {
        if (s.finished) return
        if (s.fail) s.fail(new AppError('unknown', event))
        else {
          const failed = Promise.reject(new AppError('unknown', event))
          teardown(s)
          notifyAutoStop(failed)
        }
      }
      try {
        // No timeslice: a single chunk on stop (timesliced MP4 chunks were not independently playable on older Safari).
        recorder.start()
      } catch (err) {
        teardown(s)
        throw new AppError('unknown', err)
      }
      s.startedAt = now()
      state = 'recording'

      if (s.ctx) {
        try {
          startMeter(s, s.ctx, stream)
        } catch {
          s.stopMeter = null // no level meter, recording continues
        }
      }
      s.maxTimer = setTimeout(() => {
        if (current === s && !s.stopPromise) notifyAutoStop(finalize(s))
      }, maxDurationMs)
    },

    stop() {
      const s = current
      if (!s) return Promise.reject(new AppError('invalid-input'))
      if (s.stopPromise) return s.stopPromise
      if (!s.recorder) {
        // still waiting for the permission prompt: nothing recorded yet
        cancel()
        return Promise.reject(new AppError('aborted'))
      }
      return finalize(s)
    },

    cancel,

    onLevel(cb) {
      levelListeners.add(cb)
      return () => levelListeners.delete(cb)
    },

    onAutoStop(cb) {
      autoStopListeners.add(cb)
      return () => autoStopListeners.delete(cb)
    },

    elapsedMs() {
      return current ? elapsedOf(current) : lastElapsed
    },

    state() {
      return state
    },
  }
}
