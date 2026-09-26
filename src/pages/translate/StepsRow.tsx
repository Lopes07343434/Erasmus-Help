import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/components/ui'
import { STEPS, stepIndex, type TranslatorView } from './translatorView'

/**
 * Design `steps`: 7px dots + 12px labels joined by 1px lines; the current step is bold/text, the dots and lines
 * up to it are primary. Each label stays on one line (all ≤ ~80px in pt/en/pl); when the four don't fit (≈ < 380px)
 * the row wraps instead of clipping. Screen readers get one "Passo n de 4: …" sentence (polite live region).
 */
export function StepsRow({ view }: { view: TranslatorView }) {
  const { t } = useI18n()
  const idx = stepIndex(view)
  const current = STEPS[idx]
  const last = STEPS.length - 1

  return (
    <div role="status" aria-live="polite" className="relative flex flex-wrap items-center gap-x-1.5 gap-y-2 px-1">
      <span className="sr-only">
        {current ? t('translate.steps.progress', { step: idx + 1, total: STEPS.length, label: t(`translate.steps.${current}`) }) : ''}
      </span>
      {STEPS.map((step, i) => (
        <div key={step} aria-hidden="true" className={cn('flex items-center gap-1.5', i < last ? 'flex-auto' : 'flex-none')}>
          <span className={cn('size-[7px] shrink-0 rounded-full transition-colors duration-300', i <= idx ? 'bg-primary' : 'bg-border-strong')} />
          <span
            className={cn(
              'text-xs whitespace-nowrap transition-colors duration-300',
              i === idx ? 'font-bold text-text' : i < idx ? 'font-medium text-text2' : 'font-medium text-text3',
            )}
          >
            {t(`translate.steps.${step}`)}
          </span>
          {i < last ? <span className={cn('h-px min-w-1.5 flex-1', i < idx ? 'bg-primary' : 'bg-border-strong')} /> : null}
        </div>
      ))}
    </div>
  )
}
