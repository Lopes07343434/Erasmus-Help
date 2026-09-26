import { Mic, Square } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/components/ui'
import { isBusy, type TranslatorView } from './translatorView'

const RIPPLE_DELAYS = [0, 0.7] as const

/**
 * 80px gradient mic (ring 8px primary-soft + shadow), two ehRipple rings while listening, Square to stop,
 * opacity .55 while processing/translating. Busy uses aria-disabled (not `disabled`) so keyboard focus is not
 * lost when the user stops listening with Space/Enter.
 */
export function MicButton({ view, onPress }: { view: TranslatorView; onPress: () => void }) {
  const { t } = useI18n()
  const busy = isBusy(view)
  const listening = view === 'listening'
  const label = t(`translate.mic.${view}`)

  return (
    <div className="mt-auto flex flex-col items-center gap-2.5 pt-1.5">
      <div className="relative size-20">
        {listening
          ? RIPPLE_DELAYS.map((delay) => (
              <span
                key={delay}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-primary"
                style={{ animation: `ehRipple 1.4s ease-out ${delay}s infinite` }}
              />
            ))
          : null}
        <button
          type="button"
          aria-label={label}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onPress()
          }}
          className={cn(
            'relative grid size-20 place-items-center rounded-full border-0 bg-grad text-white shadow-[0_0_0_8px_var(--primary-soft),0_16px_30px_-12px_var(--primary)] transition-[transform,opacity] duration-200',
            busy ? 'cursor-default opacity-55' : 'active:scale-[.94]',
          )}
        >
          {listening ? <Square size={28} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
        </button>
      </div>
      <span aria-hidden="true" className="text-center text-[13px] font-semibold text-text2">
        {label}
      </span>
    </div>
  )
}
