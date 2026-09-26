import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { mediaErrorToAppError, readMediaDurationMs } from '@/services/audio'
import { AppError, toAppError } from '@/services/errors'

/**
 * One shared <audio> element for every chat voice message: starting one message pauses the other (its position is
 * kept, so it resumes where it stopped). State is tracked per message id and read through `useAudioPlayer(id)`.
 *
 * iOS Safari only lets media play from a user gesture: `play()` is called synchronously inside the tap whenever the
 * URL is already known (string, Blob, or a cached signed URL). For a signed-URL resolver the shared element is
 * "unlocked" inside the tap (load()) before resolving; if Safari still refuses, the message goes to 'paused' and the
 * next tap plays it (the URL is cached by then). Object URLs created for Blob sources are revoked when released.
 */

/** A URL, an in-memory Blob (e.g. a just-recorded message) or a resolver for a signed storage URL. */
export type AudioSource = string | Blob | (() => Promise<string>)

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface AudioPlaybackState {
  status: AudioPlaybackStatus
  currentTimeMs: number
  /** From the media when finite, else the known duration given to play()/seek(); null while unknown. */
  durationMs: number | null
  /** 0..1 (0 while the duration is unknown). */
  progress: number
  /** Set when status === 'error': not-supported (format), offline, unavailable, unknown. */
  error: AppError | null
}

export interface AudioPlayOptions {
  /** Duration stored with the message (WebM from Chrome reports Infinity). */
  durationMs?: number | null
}

export interface AudioPlayerController {
  play(id: string, src: AudioSource, opts?: AudioPlayOptions): void
  pause(): void
  toggle(id: string, src: AudioSource, opts?: AudioPlayOptions): void
  seek(id: string, ms: number, opts?: AudioPlayOptions): void
  /** Stops playback and releases the source (e.g. when leaving the chat). Positions are kept. */
  stop(): void
  getState(id: string): AudioPlaybackState
  getActiveId(): string | null
  subscribe(listener: () => void): () => void
  dispose(): void
}

export interface AudioPlayerDeps {
  /** Default `document.createElement('audio')`. */
  createAudio?: () => HTMLAudioElement
  now?: () => number
  /** Resolved (signed) URLs are reused for this long. Default 5 min. */
  urlTtlMs?: number
}

export const IDLE_PLAYBACK: AudioPlaybackState = Object.freeze({ status: 'idle', currentTimeMs: 0, durationMs: null, progress: 0, error: null })

interface ActiveSource {
  id: string
  url: string | null
  objectUrl: string | null
  knownDurationMs: number | null
  /** Position to apply once metadata is loaded. */
  pendingSeekMs: number | null
  /** The user wants this playing (false after pause() while the URL was still resolving). */
  wantsPlay: boolean
  /** 'playing' fired for this source: later 'pause' events are real pauses, not leftovers from the previous source. */
  started: boolean
}

const positive = (ms: number | null | undefined): number | null => (ms != null && Number.isFinite(ms) && ms > 0 ? ms : null)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function errorName(err: unknown): string {
  return typeof err === 'object' && err !== null && 'name' in err && typeof err.name === 'string' ? err.name : ''
}

export function createAudioPlayerController(deps: AudioPlayerDeps = {}): AudioPlayerController {
  const now = deps.now ?? (() => Date.now())
  const urlTtlMs = deps.urlTtlMs ?? 5 * 60_000
  const states = new Map<string, AudioPlaybackState>()
  const urlCache = new Map<string, { url: string; at: number }>()
  const listeners = new Set<() => void>()
  let el: HTMLAudioElement | null = null
  let active: ActiveSource | null = null

  const emit = () => listeners.forEach((listener) => listener())
  const getState = (id: string): AudioPlaybackState => states.get(id) ?? IDLE_PLAYBACK

  const setState = (id: string, patch: Partial<AudioPlaybackState>) => {
    const prev = getState(id)
    const merged = { ...prev, ...patch }
    const next: AudioPlaybackState = { ...merged, progress: merged.durationMs ? clamp01(merged.currentTimeMs / merged.durationMs) : 0 }
    if (
      next.status === prev.status &&
      next.currentTimeMs === prev.currentTimeMs &&
      next.durationMs === prev.durationMs &&
      next.progress === prev.progress &&
      next.error === prev.error
    )
      return
    states.set(id, next)
    emit()
  }

  const durationOf = (src: ActiveSource) => (el ? readMediaDurationMs(el) : null) ?? src.knownDurationMs

  // ── element events (only the active source is tracked) ──
  const onMetadata = () => {
    if (!active || !el) return
    const seekMs = active.pendingSeekMs
    active.pendingSeekMs = null
    if (seekMs !== null) {
      try {
        el.currentTime = seekMs / 1000
      } catch {
        // not seekable yet: start from the beginning
      }
    }
    setState(active.id, { durationMs: durationOf(active) })
  }
  const onDuration = () => {
    if (active) setState(active.id, { durationMs: durationOf(active) })
  }
  const onTime = () => {
    if (!active || !el || active.pendingSeekMs !== null) return
    setState(active.id, { currentTimeMs: Math.round(el.currentTime * 1000) })
  }
  const onPlaying = () => {
    if (!active) return
    active.started = true
    setState(active.id, { status: 'playing', error: null })
  }
  const onWaiting = () => {
    if (active && getState(active.id).status === 'playing') setState(active.id, { status: 'loading' })
  }
  const onPause = () => {
    if (!active?.started) return
    const status = getState(active.id).status
    if (status === 'playing' || status === 'loading') setState(active.id, { status: 'paused' })
  }
  const onEnded = () => {
    if (!active) return
    active.started = false
    active.wantsPlay = false
    setState(active.id, { status: 'idle', currentTimeMs: 0 })
  }
  const onError = () => {
    if (!active?.url || !el) return
    urlCache.delete(active.id) // an expired signed URL is re-resolved on retry
    const error = mediaErrorToAppError(el.error)
    if (error.code === 'aborted') setState(active.id, { status: 'paused' })
    else setState(active.id, { status: 'error', error })
  }

  const element = (): HTMLAudioElement => {
    if (el) return el
    const audio = deps.createAudio ? deps.createAudio() : document.createElement('audio')
    audio.preload = 'auto'
    audio.addEventListener('loadedmetadata', onMetadata)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    el = audio
    return audio
  }

  const onPlayRejected = (src: ActiveSource, err: unknown) => {
    if (active !== src) return
    switch (errorName(err)) {
      case 'AbortError': // interrupted by pause() or a new source
        return
      case 'NotAllowedError': // Safari: gesture expired while resolving the URL → next tap plays it
        src.wantsPlay = false
        setState(src.id, { status: 'paused' })
        return
      case 'NotSupportedError':
        urlCache.delete(src.id)
        setState(src.id, { status: 'error', error: new AppError('not-supported', err) })
        return
      default:
        setState(src.id, { status: 'error', error: toAppError(err) })
    }
  }

  const startPlayback = (audio: HTMLAudioElement, src: ActiveSource) => {
    src.wantsPlay = true
    let pending: Promise<void> | undefined
    try {
      pending = audio.play()
    } catch (err) {
      onPlayRejected(src, err)
      return
    }
    pending?.catch((err: unknown) => onPlayRejected(src, err))
  }

  const load = (audio: HTMLAudioElement, src: ActiveSource, url: string) => {
    src.url = url
    audio.src = url
  }

  /** Pauses and releases the active source; its position is kept for a later resume. */
  const release = () => {
    const prev = active
    if (!prev) return
    active = null
    el?.pause()
    if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl)
    const s = getState(prev.id)
    if (s.status !== 'error') setState(prev.id, { status: s.currentTimeMs > 0 ? 'paused' : 'idle' })
    emit() // the active id changed even when the state did not
  }

  const stop = () => {
    release()
    if (el) {
      el.removeAttribute('src')
      try {
        el.load()
      } catch {
        // nothing to release
      }
    }
  }

  const pause = () => {
    if (!active) return
    active.wantsPlay = false
    el?.pause()
    const status = getState(active.id).status
    if (status === 'playing' || status === 'loading') setState(active.id, { status: 'paused' })
  }

  const play = (id: string, source: AudioSource, opts: AudioPlayOptions = {}) => {
    const audio = element()
    const known = positive(opts.durationMs)
    const prev = getState(id)

    if (active?.id === id && prev.status !== 'error') {
      if (prev.status === 'playing' || prev.status === 'loading') return
      if (active.url) {
        active.knownDurationMs ??= known
        setState(id, { status: 'loading', error: null })
        startPlayback(audio, active)
        return
      }
    }

    release()
    const startAt = prev.status === 'error' ? 0 : prev.currentTimeMs
    const src: ActiveSource = {
      id,
      url: null,
      objectUrl: null,
      knownDurationMs: known,
      pendingSeekMs: startAt > 0 ? startAt : null,
      wantsPlay: true,
      started: false,
    }
    active = src
    setState(id, { status: 'loading', error: null, currentTimeMs: startAt, durationMs: prev.durationMs ?? known })

    let url: string | null = null
    let resolver: (() => Promise<string>) | null = null
    if (typeof source === 'string') url = source
    else if (source instanceof Blob) {
      src.objectUrl = URL.createObjectURL(source)
      url = src.objectUrl
    } else {
      const cached = urlCache.get(id)
      if (cached && now() - cached.at < urlTtlMs) url = cached.url
      else resolver = source
    }

    if (url !== null) {
      load(audio, src, url)
      startPlayback(audio, src)
      return
    }
    if (!resolver) return

    // Signed URL still unknown: unlock the shared element inside this tap (iOS), then resolve.
    audio.removeAttribute('src')
    try {
      audio.load()
    } catch {
      // environments without media loading
    }
    resolver().then(
      (resolved) => {
        urlCache.set(id, { url: resolved, at: now() })
        if (active !== src) return
        load(audio, src, resolved)
        if (src.wantsPlay) startPlayback(audio, src)
      },
      (err: unknown) => {
        if (active === src) setState(id, { status: 'error', error: toAppError(err) })
      },
    )
  }

  return {
    play,
    pause,
    toggle(id, source, opts) {
      const status = getState(id).status
      if (active?.id === id && (status === 'playing' || status === 'loading')) pause()
      else play(id, source, opts)
    },
    seek(id, ms, opts = {}) {
      const s = getState(id)
      const duration = s.durationMs ?? positive(opts.durationMs)
      const target = Math.round(Math.max(0, duration !== null ? Math.min(ms, duration) : ms))
      if (active?.id === id && active.url && el) {
        if (el.readyState < 1 || active.pendingSeekMs !== null) active.pendingSeekMs = target
        else {
          try {
            el.currentTime = target / 1000
          } catch {
            // not seekable
          }
        }
      }
      setState(id, { currentTimeMs: target, durationMs: duration, status: s.status === 'idle' && target > 0 ? 'paused' : s.status })
    },
    stop,
    getState,
    getActiveId: () => active?.id ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      stop()
      if (el) {
        el.removeEventListener('loadedmetadata', onMetadata)
        el.removeEventListener('durationchange', onDuration)
        el.removeEventListener('timeupdate', onTime)
        el.removeEventListener('playing', onPlaying)
        el.removeEventListener('waiting', onWaiting)
        el.removeEventListener('pause', onPause)
        el.removeEventListener('ended', onEnded)
        el.removeEventListener('error', onError)
      }
      el = null
      states.clear()
      urlCache.clear()
      emit()
    },
  }
}

let shared: AudioPlayerController | null = null

/** The app-wide player (created lazily; no <audio> element until the first play). */
export function getAudioPlayer(): AudioPlayerController {
  shared ??= createAudioPlayerController()
  return shared
}

export interface AudioPlayerHandle extends AudioPlaybackState {
  /** This id owns the shared element (playing, loading or paused on it). */
  isActive: boolean
  /** Call from the tap handler (iOS). Pauses whatever else is playing. */
  play(src: AudioSource, opts?: AudioPlayOptions): void
  pause(): void
  toggle(src: AudioSource, opts?: AudioPlayOptions): void
  seek(ms: number, opts?: AudioPlayOptions): void
}

/** Playback state + controls of one message on the shared player. `controller` is a test seam. */
export function useAudioPlayer(id: string, controller?: AudioPlayerController): AudioPlayerHandle {
  const player = controller ?? getAudioPlayer()
  const state = useSyncExternalStore(
    player.subscribe,
    () => player.getState(id),
    () => IDLE_PLAYBACK,
  )
  const isActive = useSyncExternalStore(
    player.subscribe,
    () => player.getActiveId() === id,
    () => false,
  )
  const actions = useMemo(
    () => ({
      play: (src: AudioSource, opts?: AudioPlayOptions) => player.play(id, src, opts),
      pause: () => player.pause(),
      toggle: (src: AudioSource, opts?: AudioPlayOptions) => player.toggle(id, src, opts),
      seek: (ms: number, opts?: AudioPlayOptions) => player.seek(id, ms, opts),
    }),
    [player, id],
  )
  return { ...state, isActive, ...actions }
}

/** Stops chat audio when the calling screen unmounts (e.g. leaving a conversation). */
export function useStopAudioOnUnmount(controller?: AudioPlayerController) {
  useEffect(() => {
    const player = controller ?? getAudioPlayer()
    return () => player.stop()
  }, [controller])
}
