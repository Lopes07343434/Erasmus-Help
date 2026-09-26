import { Send, Square, Trash2 } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/Spinner'
import type { AudioRecorderStatus } from '@/hooks/useAudioRecorder'
import { useI18n } from '@/i18n/I18nProvider'
import { DEFAULT_MAX_AUDIO_DURATION_MS, formatDuration } from '@/services/audio'

export interface AudioRecorderBarProps {
  /** From useAudioRecorder(). The bar is meant for 'requesting' | 'recording' | 'stopping'. */
  status: AudioRecorderStatus
  elapsedMs: number
  /** Recent input levels 0..1, oldest first (useAudioRecorder().levels). */
  levels: readonly number[]
  maxDurationMs?: number
  /**
   * 'send' (default): the primary button stops and sends (Send icon, "Enviar mensagem de voz").
   * 'stop': it only stops (Square icon) — the parent then previews/sends.
   */
  stopAction?: 'send' | 'stop'
  onStop: () => void
  onCancel: () => void
  /** Countdown hint shown this long before the limit. Default 10 s. */
  warnBeforeMs?: number
  /** Layout classes only. */
  className?: string
}

const ANNOUNCE_EVERY_MS = 15_000
const MIN_BAR_SCALE = 0.14

/** Live meter: bars 3×28 radius 2 in primary (the Waveform look), height driven by the real input level. */
function LevelBars({ levels }: { levels: readonly number[] }) {
  return (
    <div aria-hidden="true" data-testid="audio-level-bars" className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden">
      {levels.map((level, i) => (
        <span
          key={i}
          className="h-7 w-[3px] shrink-0 origin-center rounded-[2px] bg-primary transition-transform duration-100 ease-out"
          style={{ transform: `scaleY(${Math.min(1, Math.max(MIN_BAR_SCALE, level)).toFixed(3)})` }}
        />
      ))}
    </div>
  )
}

/**
 * Composer content while recording a voice message (replaces the text field):
 * [cancel] [● A gravar 0:07 ▁▃▅▂▇] [send]. Screen readers get throttled announcements (every 15 s + the limit warning)
 * instead of a timer that changes 4×/s.
 */
export function AudioRecorderBar({
  status,
  elapsedMs,
  levels,
  maxDurationMs = DEFAULT_MAX_AUDIO_DURATION_MS,
  stopAction = 'send',
  onStop,
  onCancel,
  warnBeforeMs = 10_000,
  className,
}: AudioRecorderBarProps) {
  const { t, tn } = useI18n()
  const requesting = status === 'requesting'
  const recording = status === 'recording'
  const stopping = status === 'stopping'
  const remainingMs = Math.max(0, maxDurationMs - elapsedMs)
  const nearLimit = recording && remainingMs <= warnBeforeMs
  const limitLabel = tn('audio.recorder.limit', Math.round(maxDurationMs / 60_000))

  const bucket = Math.floor(elapsedMs / ANNOUNCE_EVERY_MS)
  const announcement = requesting
    ? t('audio.mic.requesting')
    : stopping
      ? t('audio.recorder.stopping')
      : nearLimit
        ? `${limitLabel}. ${t('audio.recorder.limitSoon', { seconds: Math.round(warnBeforeMs / 1000) })}`
        : bucket === 0
          ? t('audio.recorder.recording')
          : t('audio.recorder.recordingFor', { time: formatDuration(bucket * ANNOUNCE_EVERY_MS) })

  const stopLabel = stopAction === 'send' ? t('audio.recorder.send') : t('audio.recorder.stop')
  const StopIcon = stopAction === 'send' ? Send : Square

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-2', className)}>
      <button
        type="button"
        onClick={onCancel}
        disabled={stopping}
        aria-label={t('audio.recorder.cancel')}
        className="grid size-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-danger transition duration-150 hover:bg-danger-soft active:scale-[.94] disabled:bg-transparent disabled:text-text3/50"
      >
        <Trash2 size={20} aria-hidden="true" />
      </button>

      <div
        title={limitLabel}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-solid border-border-strong bg-surface px-3.5 backdrop-blur-[16px]"
      >
        {requesting ? (
          <Spinner size={14} className="text-text3" />
        ) : (
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full bg-danger', recording && 'animate-eh-shimmer')} />
        )}
        <span aria-hidden="true" className={cn('shrink-0 text-[13px] font-semibold', nearLimit ? 'text-danger' : 'text-text2')}>
          {requesting
            ? t('audio.recorder.requesting')
            : nearLimit
              ? t('audio.recorder.remaining', { seconds: Math.ceil(remainingMs / 1000) })
              : t('audio.recorder.recording')}
        </span>
        <span aria-hidden="true" data-testid="audio-recorder-timer" className={cn('shrink-0 text-[15px] font-semibold tabular-nums', nearLimit ? 'text-danger' : 'text-text')}>
          {formatDuration(elapsedMs)}
        </span>
        <LevelBars levels={levels} />
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>

      <button
        type="button"
        onClick={onStop}
        disabled={!recording}
        aria-label={stopLabel}
        aria-busy={stopping || undefined}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full border-0 transition duration-150',
          requesting ? 'bg-(--disabled-bg) text-(--disabled-text)' : 'bg-primary text-white active:scale-[.94]',
        )}
      >
        {stopping ? <Spinner size={18} /> : <StopIcon size={stopAction === 'send' ? 19 : 16} fill={stopAction === 'stop' ? 'currentColor' : 'none'} aria-hidden="true" />}
      </button>
    </div>
  )
}
