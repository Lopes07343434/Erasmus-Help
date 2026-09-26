import type { MouseEvent, ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { cn } from './cn'

interface PageHeaderProps {
  title: ReactNode
  /** 14px text3 line under the title (page variant). */
  subtitle?: ReactNode
  /** 13/500 text3 line above the title (greeting variant, e.g. the date). */
  overline?: ReactNode
  /** Trailing controls aligned to the bottom (greeting variant: bell + avatar). */
  actions?: ReactNode
  /** page = h1 26/700 · greeting = h1 30/700 (Início). */
  variant?: 'page' | 'greeting'
  className?: string
}

/** Screen header with the page h1. */
export function PageHeader({ title, subtitle, overline, actions, variant = 'page', className }: PageHeaderProps) {
  const greeting = variant === 'greeting'
  return (
    <header className={cn('flex items-end justify-between gap-3 pt-1.5', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {overline ? <span className="text-[13px] font-medium text-text3">{overline}</span> : null}
        <h1
          className={cn(
            'm-0 font-bold tracking-[-.025em] text-pretty break-words',
            greeting ? 'text-[30px] leading-[1.1]' : 'text-[26px] leading-[1.15]',
          )}
        >
          {title}
        </h1>
        {subtitle ? <p className="m-0 text-sm text-text3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  )
}

interface SectionAction {
  label: string
  to?: To
  onClick?: (e: MouseEvent<HTMLElement>) => void
}

interface SectionHeaderProps {
  title: ReactNode
  /** id for the heading so the section can use aria-labelledby. */
  id?: string
  /** Trailing text action ("Ver tudo"): a Link when `to` is set, otherwise a button. */
  action?: SectionAction
  as?: 'h2' | 'h3'
  className?: string
}

const actionClass =
  'inline-flex min-h-11 shrink-0 items-center rounded-chip border-0 bg-transparent px-1 py-2.5 text-sm font-semibold text-primary no-underline transition-colors duration-150 hover:bg-primary-soft'

/** Section title (18/700 −.01em) with an optional trailing text action. */
export function SectionHeader({ title, id, action, as: Heading = 'h2', className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <Heading id={id} className="m-0 min-w-0 text-lg font-bold tracking-[-.01em] break-words">
        {title}
      </Heading>
      {action ? (
        action.to !== undefined ? (
          <Link to={action.to} onClick={action.onClick} className={actionClass}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClass}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  )
}
