import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from './cn'
import { LangBadge } from './LangBadge'

export interface OptionItem<T extends string> {
  value: T
  label: string
  /** Language code shown in a LangBadge (e.g. "PT"). */
  badge?: string
  /** Custom leading node (flag, icon) when there is no badge. */
  leading?: ReactNode
  description?: string
  disabled?: boolean
}

interface OptionListProps<T extends string> {
  options: readonly OptionItem<T>[]
  value: T | null | undefined
  onChange: (value: T) => void
  /** Accessible name of the listbox (usually the sheet title). */
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Marks the selected option with data-autofocus so a Sheet focuses it on open (default true). */
  autoFocusSelected?: boolean
  className?: string
}

/**
 * Single-choice picker for sheets (language, role…). role="listbox" with focusable options:
 * ↑/↓/Home/End move focus, Enter/Space/click select. Selection does not follow focus, so a
 * sheet that closes on select is not closed by arrow navigation.
 */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  autoFocusSelected = true,
  className,
}: OptionListProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((o) => o.value === value)
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled)

  const move = (from: number, step: 1 | -1 | 'first' | 'last') => {
    const n = options.length
    const order =
      step === 'first'
        ? Array.from({ length: n }, (_, i) => i)
        : step === 'last'
          ? Array.from({ length: n }, (_, i) => n - 1 - i)
          : Array.from({ length: n - 1 }, (_, k) => (from + step * (k + 1) + n * n) % n)
    const next = order.find((i) => !options[i]?.disabled)
    if (next !== undefined) refs.current[next]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') move(index, 1)
    else if (e.key === 'ArrowUp') move(index, -1)
    else if (e.key === 'Home') move(index, 'first')
    else if (e.key === 'End') move(index, 'last')
    else return
    e.preventDefault()
  }

  return (
    <div role="listbox" aria-label={ariaLabel} aria-labelledby={ariaLabelledby} className={cn('-mx-2 flex flex-col gap-0.5', className)}>
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={opt.disabled || undefined}
            disabled={opt.disabled}
            tabIndex={i === tabStop ? 0 : -1}
            data-autofocus={autoFocusSelected && selected ? '' : undefined}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex min-h-[52px] w-full items-center gap-3 rounded-chip border-0 px-2.5 py-1.5 text-left text-text transition-colors duration-150 hover:bg-primary-soft focus-visible:-outline-offset-2',
              selected ? 'bg-primary-soft' : 'bg-transparent',
              opt.disabled && 'opacity-50',
            )}
          >
            {opt.badge ? <LangBadge code={opt.badge} decorative /> : opt.leading ? <span aria-hidden="true" className="shrink-0">{opt.leading}</span> : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn('text-[15px] break-words', selected ? 'font-bold' : 'font-medium')}>{opt.label}</span>
              {opt.description ? <span className="text-[13px] text-text3">{opt.description}</span> : null}
            </span>
            {selected ? <Check size={18} aria-hidden="true" className="shrink-0 text-primary" /> : null}
          </button>
        )
      })}
    </div>
  )
}
