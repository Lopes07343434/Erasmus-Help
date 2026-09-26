import { useEffect, useState } from 'react'
import { createAudioRecorder, DEFAULT_MAX_AUDIO_DURATION_MS, type AudioRecorder, type RecordedAudio } from '@/services/audio'
import { AppError, toAppError } from '@/services/errors'
import { getMicrophonePermission, type MicrophonePermission } from '@/services/speech/microphone'

/**
 * Voice-message recording for the chat composer:
 *   idle → requesting (permission prompt) → recording → stopping → idle   (any step → error)
 * `stop()` resolves with the recording (the composer sends it); `cancel()` discards it. When the recording ends on its
 * own (max duration, microphone lost) the result goes to `options.onAutoStop` instead. Audio lives in memory only.
 */

export type AudioRecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error'

export interface UseAudioRecorderOptions {
  /** Default 120 000 ms (2 min). */
  maxDurationMs?: number
  /** A valid recording that ended without stop() (max duration reached, device lost). Usually: send it. */
  onAutoStop?: (audio: RecordedAudio) => void
  /** Samples kept in `levels` (one every 100 ms). Default 32. */
  historySize?: number
  /** Injected recorder (tests). Default: a MediaRecorder-based one created per hook instance. */
  recorder?: AudioRecorder
}

export interface AudioRecorderSnapshot {
  status: AudioRecorderStatus
  /** Recorded time; updates ~4×/s while recording. */
  elapsedMs: number
  /** Current input level 0..1 (~10 fps). */
  level: number
  /** Recent levels, oldest first (length = historySize): drives the recorder bar's meter. */
  levels: readonly number[]
  /** Set when status === 'error': permission-denied | not-supported | invalid-input (too short) | unknown. */
  error: AppError | null
  /** Real microphone permission state (null until read). 'denied' → explain how to re-enable it. */
  permission: MicrophonePermission | null
}

export interface AudioRecorderHandle extends AudioRecorderSnapshot {
  isSupported: boolean
  maxDurationMs: number
  /** Start from a click/tap handler. Ignored while requesting/recording/stopping (no double starts). */
  start(): void
  /** Finish and get the recording. null when not recording, cancelled, or failed (see `error`). Only the first call of a take resolves with audio. */
  stop(): Promise<RecordedAudio | null>
  /** Discard the take (also while the permission prompt is open) and release the microphone. */
  cancel(): void
  /** Back to idle after an error. */
  clearError(): void
}

const LEVEL_TICK_MS = 100
const ELAPSED_TICK_MS = 250
const DEFAULT_HISTORY = 32
const BUSY: readonly AudioRecorderStatus[] = ['requesting', 'recording', 'stopping']

const silence = (n: number): readonly number[] => Array.from({ length: n }, () => 0)

function createController(initialOptions: UseAudioRecorderOptions, recorder: AudioRecorder, update: (patch: Partial<AudioRecorderSnapshot>) => void) {
  let options = initialOptions
  const getOptions = () => options
  let status: AudioRecorderStatus = 'idle'
  let run = 0
  let peak = 0
  let history: readonly number[] = silence(getOptions().historySize ?? DEFAULT_HISTORY)
  let timers: ReturnType<typeof setInterval>[] = []
  let unsubscribe: (() => void)[] = []
  let disposed = false

  const setStatus = (next: AudioRecorderStatus, patch: Partial<AudioRecorderSnapshot> = {}) => {
    status = next
    update({ ...patch, status: next })
  }

  const refreshPermission = () => {
    getMicrophonePermission().then(
      (permission) => {
        if (!disposed) update({ permission })
      },
      () => {},
    )
  }

  const stopTicking = () => {
    timers.forEach(clearInterval)
    timers = []
  }

  const detach = () => {
    stopTicking()
    unsubscribe.forEach((fn) => fn())
    unsubscribe = []
    peak = 0
  }

  const resetMeter = () => {
    history = silence(getOptions().historySize ?? DEFAULT_HISTORY)
    return { elapsedMs: 0, level: 0, levels: history }
  }

  const startTicking = (id: number) => {
    timers.push(
      setInterval(() => {
        if (id !== run) return
        history = [...history.slice(1), peak]
        update({ level: peak, levels: history })
        peak = 0
      }, LEVEL_TICK_MS),
      setInterval(() => {
        if (id === run) update({ elapsedMs: recorder.elapsedMs() })
      }, ELAPSED_TICK_MS),
    )
  }

  const fail = (err: unknown) => {
    detach()
    const error = toAppError(err)
    if (error.code === 'aborted') setStatus('idle', resetMeter())
    else setStatus('error', { ...resetMeter(), error })
    if (error.code === 'permission-denied') refreshPermission()
  }

  const handleAutoStop = (id: number, result: Promise<RecordedAudio>) => {
    // A manual stop() already owns this take (or it was cancelled): deliver it only once.
    if (id !== run || status !== 'recording') return
    detach()
    setStatus('stopping', { elapsedMs: recorder.elapsedMs(), level: 0 })
    result.then(
      (audio) => {
        if (id !== run) return
        setStatus('idle', resetMeter())
        getOptions().onAutoStop?.(audio)
      },
      (err: unknown) => {
        if (id === run) fail(err)
      },
    )
  }

  const cancel = () => {
    run += 1
    detach()
    recorder.cancel()
    if (status !== 'idle') setStatus('idle', { ...resetMeter(), error: null })
  }

  return {
    init() {
      disposed = false
      refreshPermission()
    },
    configure(next: UseAudioRecorderOptions) {
      options = next
    },
    start() {
      if (BUSY.includes(status)) return
      if (!recorder.isSupported()) {
        setStatus('error', { error: new AppError('not-supported') })
        return
      }
      run += 1
      const id = run
      detach()
      setStatus('requesting', { ...resetMeter(), error: null })
      unsubscribe.push(
        recorder.onLevel((level) => {
          if (id === run && level > peak) peak = level
        }),
        recorder.onAutoStop((result) => handleAutoStop(id, result)),
      )
      recorder.start({ maxDurationMs: getOptions().maxDurationMs ?? DEFAULT_MAX_AUDIO_DURATION_MS }).then(
        () => {
          if (id !== run) return
          setStatus('recording', { permission: 'granted' })
          startTicking(id)
        },
        (err: unknown) => {
          if (id === run) fail(err)
        },
      )
    },
    async stop(): Promise<RecordedAudio | null> {
      if (status === 'requesting') {
        cancel()
        return null
      }
      if (status !== 'recording') return null
      const id = run
      detach()
      setStatus('stopping', { elapsedMs: recorder.elapsedMs(), level: 0 })
      try {
        const audio = await recorder.stop()
        if (id !== run) return null
        setStatus('idle', resetMeter())
        return audio
      } catch (err) {
        if (id === run) fail(err)
        return null
      }
    },
    cancel,
    clearError() {
      if (status === 'error') setStatus('idle', { error: null })
    },
    dispose() {
      disposed = true
      run += 1
      detach()
      recorder.cancel()
      status = 'idle'
    },
  }
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): AudioRecorderHandle {
  const historySize = options.historySize ?? DEFAULT_HISTORY
  const [state, setState] = useState<AudioRecorderSnapshot>(() => ({
    status: 'idle',
    elapsedMs: 0,
    level: 0,
    levels: silence(historySize),
    error: null,
    permission: null,
  }))
  const [recorder] = useState(() => options.recorder ?? createAudioRecorder())
  const [controller] = useState(() => createController(options, recorder, (patch) => setState((s) => ({ ...s, ...patch }))))
  useEffect(() => {
    controller.configure(options)
  })
  useEffect(() => {
    controller.init()
    return () => controller.dispose()
  }, [controller])

  return {
    ...state,
    isSupported: recorder.isSupported(),
    maxDurationMs: options.maxDurationMs ?? DEFAULT_MAX_AUDIO_DURATION_MS,
    start: controller.start,
    stop: controller.stop,
    cancel: controller.cancel,
    clearError: controller.clearError,
  }
}
