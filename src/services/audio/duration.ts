import { AppError } from '@/services/errors'

/**
 * Audio duration helpers.
 *
 * Chrome/Edge/Android write WebM files from MediaRecorder without a duration header, so an <audio> element reports
 * `duration === Infinity` (sometimes NaN) until the whole file has been scanned. Always prefer the duration measured
 * by the recorder (stored with the message); `getAudioDuration` only probes the media as a fallback.
 */

/** "0:07", "1:42", "12:05". Invalid, negative or infinite values → "0:00". `round` rounds to the nearest second (totals); default floors (running timers). */
export function formatDuration(ms: number, rounding: 'floor' | 'round' = 'floor'): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? (rounding === 'round' ? Math.round(ms / 1000) : Math.floor(ms / 1000)) : 0
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Finite, positive duration of a media element in ms, or null while unknown (WebM reports Infinity/NaN). */
export function readMediaDurationMs(el: Pick<HTMLMediaElement, 'duration'>): number | null {
  const d = el.duration
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null
}

/** Maps a failed media element (`el.error`) to an AppError: undecodable format → not-supported, network → offline/unavailable. */
export function mediaErrorToAppError(error: Pick<MediaError, 'code'> | null | undefined): AppError {
  // MediaError codes: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED (numbers: jsdom/old WebKit lack the constants).
  switch (error?.code) {
    case 1:
      return new AppError('aborted', error)
    case 2:
      return new AppError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable', error)
    case 3:
    case 4:
      return new AppError('not-supported', error)
    default:
      return new AppError('unknown', error)
  }
}

export interface AudioDurationOptions {
  /** Duration measured by the recorder / stored with the message. Used as-is when finite and > 0. */
  knownDurationMs?: number | null
  /** Give up after this long (default 8 s) → AppError('timeout'). */
  timeoutMs?: number
  signal?: AbortSignal
  /** Test seam: creates the probing element (default `document.createElement('audio')`). */
  createAudio?: () => HTMLAudioElement
}

/**
 * Reliable duration (ms) for a Blob or URL. Returns `knownDurationMs` when available; otherwise loads metadata and,
 * when the browser reports Infinity (Chrome WebM), seeks to a huge `currentTime` so it scans to the end and fixes
 * `duration`. Object URLs created here are revoked before returning.
 */
export function getAudioDuration(src: Blob | string, options: AudioDurationOptions = {}): Promise<number> {
  const { knownDurationMs, timeoutMs = 8000, signal } = options
  if (knownDurationMs != null && Number.isFinite(knownDurationMs) && knownDurationMs > 0) return Promise.resolve(Math.round(knownDurationMs))
  if (signal?.aborted) return Promise.reject(new AppError('aborted'))

  return new Promise<number>((resolve, reject) => {
    const el = options.createAudio ? options.createAudio() : document.createElement('audio')
    const ownsUrl = typeof src !== 'string'
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    let seekingToEnd = false
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('timeupdate', onDurationChange)
      el.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      el.removeAttribute('src')
      try {
        el.load()
      } catch {
        // jsdom / detached elements: nothing to release
      }
      if (ownsUrl) URL.revokeObjectURL(url)
    }
    const finish = (value: number | AppError) => {
      if (settled) return
      settled = true
      cleanup()
      if (value instanceof AppError) reject(value)
      else resolve(value)
    }

    const onDurationChange = () => {
      const ms = readMediaDurationMs(el)
      if (ms !== null) finish(ms)
    }
    const onMeta = () => {
      const ms = readMediaDurationMs(el)
      if (ms !== null) return finish(ms)
      if (seekingToEnd) return
      // Chrome WebM: duration is Infinity until the element seeks past the end.
      seekingToEnd = true
      el.currentTime = 1e101
    }
    const onError = () => finish(mediaErrorToAppError(el.error))
    const onAbort = () => finish(new AppError('aborted'))
    const timer = setTimeout(() => finish(new AppError('timeout')), timeoutMs)

    el.preload = 'metadata'
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('timeupdate', onDurationChange)
    el.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort)
    el.src = url
  })
}
