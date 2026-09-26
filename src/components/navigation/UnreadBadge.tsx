import { cn } from '@/components/ui/cn'
import { formatUnread } from './formatUnread'

interface UnreadBadgeProps {
  count: number
  /** md = 20px (rows, tabs) · sm = 18px (on top of a nav icon). */
  size?: 'md' | 'sm'
  /** Adds a 2px ring in the page background (on top of an icon, like the bell's dot). */
  ring?: boolean
  /** Layout/position classes only. */
  className?: string
}

const sizes = {
  md: 'h-5 min-w-5 px-1.5 text-[11px]',
  sm: 'h-[18px] min-w-[18px] px-1 text-[10px]',
} as const

/**
 * Primary pill with the unread count (700, tabular). Decorative: the owner (nav link, conversation row, tab)
 * carries the spoken count in its accessible name. Renders nothing for 0.
 */
export function UnreadBadge({ count, size = 'md', ring, className }: UnreadBadgeProps) {
  if (!(count > 0)) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-primary-strong leading-none font-bold text-white tabular-nums',
        sizes[size],
        ring && 'shadow-[0_0_0_2px_var(--bg)]',
        className,
      )}
    >
      {formatUnread(count)}
    </span>
  )
}
