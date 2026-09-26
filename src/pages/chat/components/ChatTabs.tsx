import { useRef, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { UnreadBadge } from '@/components/navigation/UnreadBadge'
import { cn } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { chatPanelId, chatTabId } from '../chatPaths'

export interface ChatTabOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Unread counter shown next to the label (and spoken with the tab name). */
  count?: number
}

interface ChatTabsProps<T extends string> {
  options: readonly ChatTabOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  /** Base id: tab = `${id}-tab-${value}`, panel = `${id}-panel-${value}`. */
  id: string
  className?: string
}

/**
 * The design-system SegmentedControl (same look and keyboard model: arrows / Home / End select) plus an unread
 * counter per tab, which SegmentedControl's string labels cannot carry.
 */
export function ChatTabs<T extends string>({ options, value, onChange, 'aria-label': ariaLabel, id, className }: ChatTabsProps<T>) {
  const { tn } = useI18n()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    const opt = options[next]
    if (!opt) return
    onChange(opt.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('grid gap-1 rounded-tile border border-solid border-border bg-surface p-1 backdrop-blur-[18px]', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        const Icon = opt.icon
        const count = opt.count ?? 0
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={chatTabId(id, opt.value)}
            aria-selected={selected}
            aria-controls={selected ? chatPanelId(id, opt.value) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-chip border-0 px-1 text-[13px] font-bold tracking-[-.01em] transition-[background-color,color,box-shadow] duration-200',
              selected
                ? 'bg-surface-solid text-primary shadow-[0_0_0_1px_var(--border),0_4px_12px_-4px_rgba(16,24,48,.14)]'
                : 'bg-transparent text-text2',
            )}
          >
            {Icon ? <Icon size={15} aria-hidden="true" className="shrink-0" /> : null}
            <span className="line-clamp-2 min-w-0 text-center leading-[1.1] break-words">{opt.label}</span>
            <UnreadBadge count={count} />
            {count > 0 ? <span className="sr-only">{`, ${tn('chat.unread', count)}`}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
