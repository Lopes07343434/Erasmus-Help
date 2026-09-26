import type { ReactNode, RefObject } from 'react'
import { BrandRow } from '@/components/brand'
import { ProgressDots } from './ProgressDots'

interface OnboardingFrameProps {
  /** Right side of the header row ("Saltar" on the intro, back on the questions). */
  headerAction?: ReactNode
  /** Intro layout: centred illustration above the text (re-animates when `visualKey` changes). */
  visual?: ReactNode
  visualKey?: string
  title: string
  titleId?: string
  headingRef: RefObject<HTMLHeadingElement | null>
  body?: ReactNode
  /** Question layout: the controls, below the text (re-animates when `contentKey` changes). */
  children?: ReactNode
  contentKey?: string
  progress: { index: number; total: number; label: string }
  /** Primary CTA; the footer keeps its height when there is none. */
  cta?: ReactNode
}

/**
 * The prototype's onboarding frame: header row (48px) · flexible area · title 28/700 + body 16/1.5 ·
 * footer with progress dots and the CTA. Full height with safe areas on mobile; a 440px column on desktop.
 */
export function OnboardingFrame({
  headerAction,
  visual,
  visualKey,
  title,
  titleId,
  headingRef,
  body,
  children,
  contentKey,
  progress,
  cta,
}: OnboardingFrameProps) {
  const text = (
    <div className="flex flex-col gap-2.5">
      <h1
        ref={headingRef}
        id={titleId}
        tabIndex={-1}
        className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-.025em] text-pretty break-words outline-none"
      >
        {title}
      </h1>
      {body ? <p className="m-0 text-base leading-[1.5] text-pretty text-text2">{body}</p> : null}
    </div>
  )

  return (
    <div className="relative z-(--z-content) flex min-h-dvh flex-col items-center justify-center">
      <main className="flex min-h-dvh w-full max-w-[440px] flex-col px-6 pt-[calc(env(safe-area-inset-top)_+_16px)] pb-[calc(env(safe-area-inset-bottom)_+_24px)] sm:min-h-[min(100dvh,860px)]">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3">
          <BrandRow />
          {headerAction}
        </header>

        {visual !== undefined ? (
          <>
            <div key={visualKey} className="flex flex-1 animate-[ehFade_.35s_ease_both] items-center justify-center py-8">
              {visual}
            </div>
            <div className="min-h-[150px]">{text}</div>
          </>
        ) : (
          <div key={contentKey} className="flex flex-1 animate-eh-fade flex-col gap-6 pt-6 pb-2">
            {text}
            {children}
          </div>
        )}

        <footer className="mt-4 flex min-h-[52px] shrink-0 items-center justify-between gap-4">
          <ProgressDots {...progress} />
          {cta}
        </footer>
      </main>
    </div>
  )
}
