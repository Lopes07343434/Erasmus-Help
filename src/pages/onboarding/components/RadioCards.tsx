import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { GlassCardButton } from '@/components/ui'
import { cn } from '@/components/ui/cn'

export interface RadioCardOption<T extends string> {
  value: T
  title: string
  description?: string
  /** Leading visual (icon tile, flag + badge). Decorative. */
  leading: ReactNode
  /** BCP 47 tag of the title when it is not in the UI language (native language names). */
  lang?: string
}

interface RadioCardsProps<T extends string> {
  options: readonly RadioCardOption<T>[]
  value: T | null
  /** Selection (click, Space/Enter, or arrow keys — radio semantics). */
  onChange: (value: T) => void
  /** Explicit activation only (click / Space / Enter, not arrows), e.g. to close a sheet. */
  onActivate?: (value: T) => void
  'aria-labelledby'?: string
  'aria-label'?: string
}

/**
 * Large single-choice cards (role, language). radiogroup/radio semantics with a roving tab stop:
 * arrows/Home/End move and select, Space/Enter/click select. Selected = primary border + primary-soft + check.
 */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  onActivate,
  'aria-labelledby': labelledBy,
  'aria-label': label,
}: RadioCardsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((o) => o.value === value)
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = options.length
    let next: number | null = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % n
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    const opt = options[next]
    if (!opt) return
    onChange(opt.value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={label} className="flex flex-col gap-3">
      {options.map((opt, i) => {
        const selected = opt.value === value
        return (
          <GlassCardButton
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabStop ? 0 : -1}
            press="sm"
            onClick={() => {
              onChange(opt.value)
              onActivate?.(opt.value)
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="relative"
          >
            {selected ? (
              <span aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-card border border-solid border-primary bg-primary-soft" />
            ) : null}
            <span className="relative flex items-center gap-3">
              <span aria-hidden="true" className="flex shrink-0 items-center">
                {opt.leading}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span lang={opt.lang} className="text-base font-semibold break-words">
                  {opt.title}
                </span>
                {opt.description ? <span className="text-[13px] leading-[1.35] text-text3">{opt.description}</span> : null}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-[22px] shrink-0 place-items-center rounded-full transition-colors duration-200',
                  selected ? 'bg-primary text-white' : 'border-2 border-solid border-border-strong',
                )}
              >
                {selected ? <Check size={14} strokeWidth={3} /> : null}
              </span>
            </span>
          </GlassCardButton>
        )
      })}
    </div>
  )
}
