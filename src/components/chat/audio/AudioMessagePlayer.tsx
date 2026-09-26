import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/Spinner'
import { useAudioPlayer, type AudioPlayerController, type AudioSource } from '@/hooks/useAudioPlayer'
import { useI18n } from '@/i18n/I18nProvider'
import { formatDuration } from '@/services/audio'
import { playerErrorMessageKey, spokenDuration } from './messages'

export interface AudioMessagePlayerProps {
  /** Message id: one shared player for the whole app, state tracked per id. */
  id: string
  /** URL, in-memory Blob (optimistic message) or a resolver returning a (signed) URL — called on first play only. */
  src: AudioSource
  /** Duration stored with the message (recorder-measured). Used while the media reports none (Chrome WebM). */
  durationMs: number
  /** own = on the primary bubble (white content) · other = on a glass bubble (primary content). */
  tone: 'own' | 'other'
  /** Layout classes only (default width 240px, max 100%). */
  className?: string
  /** Test seam: defaults to the app-wide shared player. */
  controller?: AudioPlayerController
}

const KEY_STEP_MS = 5000

const toneStyles = {
  own: {
    button: 'bg-white text-primary focus-visible:outline-white',
    track: 'bg-white/35',
    fill: 'bg-white',
    text: 'text-white/85',
    error: 'text-white',
    slider: 'focus-visible:outline-white',
  },
  other: {
    button: 'bg-primary text-white',
    track: 'bg-border-strong',
    fill: 'bg-primary',
    text: 'text-text2',
    error: 'text-danger',
    slider: '',
  },
} as const

/** Content of an audio message bubble: play/pause (44px), seekable progress track, elapsed / total. */
export function AudioMessagePlayer({ id, src, durationMs, tone, className, controller }: AudioMessagePlayerProps) {
  const i18n = useI18n()
  const { t } = i18n
  const player = useAudioPlayer(id, controller)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const styles = toneStyles[tone]

  const knownMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null
  const totalMs = player.durationMs ?? knownMs
  const currentMs = totalMs !== null ? Math.min(player.currentTimeMs, totalMs) : player.currentTimeMs
  const progress = totalMs ? Math.min(1, Math.max(0, currentMs / totalMs)) : 0
  const playing = player.status === 'playing'
  const loading = player.status === 'loading'
  const failed = player.status === 'error'
  const opts = { durationMs: knownMs }

  const buttonLabel = playing ? t('audio.player.pause') : loading ? t('audio.player.loading') : failed ? t('audio.player.retry') : t('audio.player.play')

  const seekTo = (ms: number) => {
    if (totalMs === null) return
    player.seek(Math.min(totalMs, Math.max(0, ms)), opts)
  }

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current
    if (!track || totalMs === null) return
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return
    seekTo(((clientX - rect.left) / rect.width) * totalMs)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (totalMs === null || (e.pointerType === 'mouse' && e.button !== 0)) return
    dragging.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture unsupported: seeking still works per event
    }
    seekFromPointer(e.clientX)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekFromPointer(e.clientX)
  }

  const endDrag = () => {
    dragging.current = false
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (totalMs === null) return
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = currentMs + KEY_STEP_MS
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = currentMs - KEY_STEP_MS
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = totalMs
    if (next === null) return
    e.preventDefault()
    seekTo(next)
  }

  const valueText =
    totalMs !== null
      ? t('audio.player.position', { current: spokenDuration(currentMs, i18n), total: spokenDuration(totalMs, i18n) })
      : t('audio.player.unknownDuration')

  return (
    <div className={cn('flex w-60 max-w-full min-w-0 items-center gap-3', className)}>
      <button
        type="button"
        onClick={() => player.toggle(src, opts)}
        aria-label={buttonLabel}
        aria-busy={loading || undefined}
        className={cn('grid size-11 shrink-0 place-items-center rounded-full border-0 transition duration-150 active:scale-[.94]', styles.button)}
      >
        {loading ? (
          <Spinner size={18} />
        ) : failed ? (
          <RotateCcw size={18} aria-hidden="true" />
        ) : playing ? (
          <Pause size={18} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={18} fill="currentColor" aria-hidden="true" className="translate-x-px" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={totalMs !== null ? 0 : -1}
          aria-label={t('audio.player.seek')}
          aria-valuemin={0}
          aria-valuemax={totalMs !== null ? Math.round(totalMs / 1000) : 0}
          aria-valuenow={Math.floor(currentMs / 1000)}
          aria-valuetext={valueText}
          aria-disabled={totalMs === null || undefined}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            // 16px visual row; the ::before extends the hit area to 44px without moving the layout
            'relative flex h-4 touch-none items-center rounded-full select-none before:absolute before:inset-x-0 before:-inset-y-3.5',
            totalMs !== null ? 'cursor-pointer' : 'cursor-default',
            styles.slider,
          )}
        >
          <div className={cn('relative h-1 w-full overflow-hidden rounded-full', styles.track)}>
            <div className={cn('absolute inset-y-0 left-0 rounded-full', styles.fill)} style={{ width: `${progress * 100}%` }} />
          </div>
          <span
            aria-hidden="true"
            className={cn('pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full', styles.fill)}
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        {failed ? (
          <p role="status" className={cn('m-0 text-xs leading-4 font-semibold', styles.error)}>
            {t(playerErrorMessageKey(player.error))}
          </p>
        ) : (
          <div aria-hidden="true" className={cn('flex justify-between text-xs leading-4 font-medium tabular-nums', styles.text)}>
            <span data-testid="audio-elapsed">{formatDuration(currentMs)}</span>
            <span data-testid="audio-total">{totalMs !== null ? formatDuration(totalMs, 'round') : '-:--'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
