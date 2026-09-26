import { Children, isValidElement, useId, type MouseEvent, type ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { SwitchTrack } from './Switch'

/** 13/600 uppercase +.04em text3 section title above a list group. */
export function ListSectionTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return <h2 id={id} className={cn('mx-1 my-0 text-[13px] font-semibold tracking-[.04em] text-text3 uppercase', className)}>{children}</h2>
}

/** Titled settings section: title + gap 8 + group. */
export function ListSection({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-2', className)}>
      <ListSectionTitle id={id}>{title}</ListSectionTitle>
      <ListGroup>{children}</ListGroup>
    </section>
  )
}

/** Glass group (radius 20, no shadow) with 1px dividers inset 16px between rows. Children should be ListRow/ListSwitchRow. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('glass m-0 list-none overflow-hidden rounded-card p-0', className)}>
      {Children.toArray(children).map((child, i) => (
        <li
          key={isValidElement(child) && child.key !== null ? child.key : i}
          className="relative not-first:pt-px not-first:before:absolute not-first:before:inset-x-4 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border"
        >
          {child}
        </li>
      ))}
    </ul>
  )
}

type RowTone = 'default' | 'danger'

interface RowContentProps {
  icon?: LucideIcon
  /** Custom leading node instead of `icon` (e.g. `<BrandMark size={18} />`). */
  leading?: ReactNode
  label: ReactNode
  /** Optional secondary line (13px text3). */
  description?: ReactNode
  /** Trailing value (14px text3), e.g. the current language. */
  value?: ReactNode
  tone?: RowTone
}

const rowClass =
  'relative flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-4 text-left text-text no-underline focus-visible:-outline-offset-2'
const interactiveClass = 'transition-colors duration-150 active:bg-primary-soft'

function RowContent({ icon: Icon, leading, label, description, value, tone = 'default' }: RowContentProps) {
  const danger = tone === 'danger'
  return (
    <>
      {leading ?? (Icon ? <Icon size={19} aria-hidden="true" className={cn('shrink-0', danger ? 'text-danger' : 'text-text2')} /> : null)}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
        <span className={cn('text-[15px] font-medium break-words', danger && 'text-danger')}>{label}</span>
        {description ? <span className="text-[13px] leading-[1.35] text-text3">{description}</span> : null}
      </span>
      {value !== undefined && value !== null ? <span className="max-w-[45%] shrink-0 truncate text-sm text-text3">{value}</span> : null}
    </>
  )
}

interface ListRowProps extends RowContentProps {
  /** Navigates with react-router when set. */
  to?: To
  replace?: boolean
  onClick?: (e: MouseEvent<HTMLElement>) => void
  disabled?: boolean
  /** Trailing element: chevron (default for interactive rows), none, or custom node. */
  trailing?: 'chevron' | 'none' | ReactNode
  id?: string
  'aria-label'?: string
  className?: string
}

/** Settings row, min-height 56. Renders a Link (`to`), a button (`onClick`) or a static row. */
export function ListRow({ to, replace, onClick, disabled, trailing, id, 'aria-label': ariaLabel, className, ...content }: ListRowProps) {
  const interactive = to !== undefined || onClick !== undefined
  const trailingNode =
    trailing === 'none' ? null : trailing === 'chevron' || (trailing === undefined && interactive) ? (
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text3" />
    ) : (
      (trailing ?? null)
    )
  const inner = (
    <>
      <RowContent {...content} />
      {trailingNode}
    </>
  )

  if (to !== undefined && !disabled) {
    return (
      <Link to={to} replace={replace} onClick={onClick} id={id} aria-label={ariaLabel} className={cn(rowClass, interactiveClass, className)}>
        {inner}
      </Link>
    )
  }
  if (interactive) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} id={id} aria-label={ariaLabel} className={cn(rowClass, interactiveClass, disabled && 'opacity-50', className)}>
        {inner}
      </button>
    )
  }
  return (
    <div id={id} className={cn(rowClass, className)}>
      {inner}
    </div>
  )
}

interface ListSwitchRowProps extends Omit<RowContentProps, 'value' | 'tone'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

/** Row that is itself the switch (role="switch" on the whole row, like the prototype's "Modo escuro"). */
export function ListSwitchRow({ checked, onCheckedChange, disabled, id, className, ...content }: ListSwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      id={id}
      onClick={() => onCheckedChange(!checked)}
      className={cn(rowClass, 'cursor-pointer', disabled && 'opacity-50', className)}
    >
      <RowContent {...content} />
      <SwitchTrack checked={checked} />
    </button>
  )
}
