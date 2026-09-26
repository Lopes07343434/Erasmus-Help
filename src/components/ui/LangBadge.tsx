import { cn } from './cn'

interface LangBadgeProps {
  /** Short language code as displayed, e.g. "PT" (use `getLanguage(code).short`). */
  code: string
  /** Hide from assistive tech when the language name is next to it (default false). */
  decorative?: boolean
  className?: string
}

/** JetBrains Mono 11/500 code chip on primary-soft (e.g. "PT"). */
export function LangBadge({ code, decorative, className }: LangBadgeProps) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn('inline-block shrink-0 rounded-[6px] bg-primary-soft px-[5px] py-[3px] font-mono text-[11px] leading-[normal] font-medium text-primary', className)}
    >
      {code}
    </span>
  )
}
