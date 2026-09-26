import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export type PillTone = 'success' | 'primary' | 'danger'

interface StatusPillProps {
  tone?: PillTone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}

const tones: Record<PillTone, string> = {
  success: 'bg-success-soft text-success',
  primary: 'bg-primary-soft text-primary',
  danger: 'bg-danger-soft text-danger',
}

/** Rounded status pill, 12/600 (e.g. "Corrigido", "Ouvir"). */
export function StatusPill({ tone = 'primary', icon: Icon, children, className }: StatusPillProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-xs font-semibold', tones[tone], className)}>
      {Icon ? <Icon size={12} aria-hidden="true" className="shrink-0" /> : null}
      {children}
    </span>
  )
}
