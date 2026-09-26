import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export type IconTileVariant = 'soft' | 'softLg' | 'surface'
export type IconTileTone = 'primary' | 'danger'

interface IconTileProps {
  icon?: LucideIcon
  /** Custom content instead of a lucide icon (e.g. the brand mark). */
  children?: ReactNode
  /**
   * soft = 40×40 radius 12, tinted (card rows) · softLg = 52×52 radius 16, tinted (empty/error states) ·
   * surface = 52×52 radius 16, surface + border, coloured icon ("Ações rápidas").
   */
  variant?: IconTileVariant
  tone?: IconTileTone
  className?: string
}

const shape: Record<IconTileVariant, string> = {
  soft: 'size-10 rounded-chip',
  softLg: 'size-[52px] rounded-tile',
  surface: 'size-[52px] rounded-tile border border-solid border-border bg-surface',
}

const iconSize: Record<IconTileVariant, number> = { soft: 19, softLg: 22, surface: 20 }

const toneClass = (variant: IconTileVariant, tone: IconTileTone) => {
  if (variant === 'surface') return tone === 'danger' ? 'text-danger' : 'text-primary'
  return tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary'
}

/** Decorative icon container. */
export function IconTile({ icon: Icon, children, variant = 'soft', tone = 'primary', className }: IconTileProps) {
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center', shape[variant], toneClass(variant, tone), className)}>
      {Icon ? <Icon size={iconSize[variant]} /> : children}
    </span>
  )
}
