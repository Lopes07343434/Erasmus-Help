import { useId, useRef, type KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** id of the tabpanel this tab controls (sets aria-controls). */
  controls?: string
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the tablist (e.g. "Modo de conversa"). */
  'aria-label': string
  /** Base id; each tab gets `${id}-tab-${value}` so a tabpanel can use aria-labelledby. */
  id?: string
  className?: string
}

const segmentTabId = (baseId: string, value: string) => `${baseId}-tab-${value}`

/**
 * Tabs styled as the "Conversar" mode switch. Automatic activation: arrows / Home / End move focus and select.
 * Labels wrap to two lines instead of overflowing on narrow screens (Polish).
 */
export function SegmentedControl<T extends string>({ options, value, onChange, 'aria-label': ariaLabel, id, className }: SegmentedControlProps<T>) {
  const autoId = useId()
  const baseId = id ?? autoId
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const select = (index: number) => {
    const opt = options[index]
    if (!opt) return
    onChange(opt.value)
    refs.current[index]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    select(next)
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
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={segmentTabId(baseId, opt.value)}
            aria-selected={selected}
            aria-controls={opt.controls}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex h-10 min-w-0 items-center justify-center gap-[5px] rounded-chip border-0 px-1 text-[12.5px] font-bold tracking-[-.01em] transition-[background-color,color,box-shadow] duration-200',
              selected
                ? 'bg-surface-solid text-primary shadow-[0_0_0_1px_var(--border),0_4px_12px_-4px_rgba(16,24,48,.14)]'
                : 'bg-transparent text-text2',
            )}
          >
            {Icon ? <Icon size={15} aria-hidden="true" className="shrink-0" /> : null}
            <span className="line-clamp-2 min-w-0 text-center leading-[1.1] break-words">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
