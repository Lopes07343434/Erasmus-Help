import type { ComponentPropsWithRef, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export type IconButtonVariant = 'outline' | 'glass' | 'solid' | 'plain'

type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'> & {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string
  /**
   * outline = 1px border-strong, text2 (copy) · glass = surface + blur 16, text (bell) ·
   * solid = primary fill, white (avatar) · plain = no border, text2, hover primary-soft (sheet close).
   */
  variant?: IconButtonVariant
  /** circle (50%) or rounded (14px). */
  shape?: 'circle' | 'rounded'
  /** md = 44px, lg = 52px. */
  size?: 'md' | 'lg'
  icon?: LucideIcon
  /** Icon size in px (default 19 for md, 20 for lg). */
  iconSize?: number
  /** Accent dot at the top-right (unread). Mention it in aria-label too. */
  badge?: boolean
  children?: ReactNode
}

const variants: Record<IconButtonVariant, string> = {
  outline: 'border border-solid border-border-strong bg-transparent text-text2 hover:bg-primary/6 hover:text-primary active:scale-[.94]',
  glass: 'border border-solid border-border bg-surface text-text backdrop-blur-[16px] active:scale-[.94]',
  solid: 'border-0 bg-primary text-white text-sm font-bold active:scale-[.94]',
  plain: 'border-0 bg-transparent text-text2 hover:bg-primary-soft active:bg-primary-soft',
}

const disabledVariants: Record<IconButtonVariant, string> = {
  outline: 'border border-solid border-border bg-transparent text-text3/50',
  glass: 'border border-solid border-border bg-surface text-text3/50 backdrop-blur-[16px]',
  solid: 'border-0 bg-(--disabled-bg) text-(--disabled-text) text-sm font-bold',
  plain: 'border-0 bg-transparent text-text3/50',
}

export function IconButton({
  variant = 'outline',
  shape = 'circle',
  size = 'md',
  icon: Icon,
  iconSize,
  badge,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      className={cn(
        'relative grid shrink-0 place-items-center transition duration-150',
        size === 'lg' ? 'size-[52px]' : 'size-11',
        shape === 'circle' ? 'rounded-full' : 'rounded-control',
        disabled ? disabledVariants[variant] : variants[variant],
        className,
      )}
    >
      {Icon ? <Icon size={iconSize ?? (size === 'lg' ? 20 : 19)} aria-hidden="true" /> : null}
      {children}
      {badge ? (
        <span aria-hidden="true" className="absolute top-[10px] right-[11px] size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg)]" />
      ) : null}
    </button>
  )
}
