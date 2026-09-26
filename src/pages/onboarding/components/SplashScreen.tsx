import { useEffect, useRef, type KeyboardEvent } from 'react'
import { BrandMark, Tagline, Wordmark } from '@/components/brand'
import { useI18n } from '@/i18n/I18nProvider'
import { MARK_HALO, markHeightForWidth } from './brandSize'

/** Same timing as the prototype (componentDidMount → onboarding after 1.9s). */
export const SPLASH_DURATION_MS = 1900

/** First-run splash: blob + 96px mark, 32px wordmark, tagline, 120×3 loading bar. Tap/Enter skips it. */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const id = setTimeout(() => onDoneRef.current(), SPLASH_DURATION_MS)
    return () => clearTimeout(id)
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault()
      onDone()
    }
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={t('onboarding.splash.label')}
      onClick={onDone}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-(--z-content) flex animate-[ehFade_.4s_ease_both] cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden px-6 outline-none select-none"
    >
      <div className="relative grid size-[120px] place-items-center">
        <div className="absolute -inset-[60px] rounded-full" style={{ background: MARK_HALO }} />
        <BrandMark size={markHeightForWidth(96)} className="relative" />
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <Wordmark size="lg" />
        <Tagline />
      </div>
      <div className="absolute bottom-[calc(90px_+_env(safe-area-inset-bottom))] left-1/2 h-[3px] w-[120px] -translate-x-1/2 overflow-hidden rounded-[2px] bg-border">
        <div className="h-full animate-[ehLoad_1.7s_ease_both] rounded-[2px] bg-grad" />
      </div>
    </div>
  )
}
