import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles'
import { Spinner } from './Spinner'

interface ButtonOwnProps {
  variant?: ButtonVariant
  /** md = 52px (44 for ghost), sm = 44px. */
  size?: ButtonSize
  /** Leading lucide icon, rendered at 18px. */
  icon?: LucideIcon
  /** Trailing lucide icon (e.g. ArrowRight on onboarding CTAs), 18px. */
  trailingIcon?: LucideIcon
  fullWidth?: boolean
  /** Shows the ring spinner in place of the leading icon, disables the button and sets aria-busy. */
  loading?: boolean
  children?: ReactNode
}

export type ButtonProps = ButtonOwnProps & Omit<ComponentPropsWithRef<'button'>, 'children'>

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  trailingIcon: TrailingIcon,
  fullWidth,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth, disabled: disabled && !loading, className })}
    >
      {loading ? <Spinner size={16} /> : Icon ? <Icon size={18} aria-hidden="true" className="shrink-0" /> : null}
      {children}
      {TrailingIcon && !loading ? <TrailingIcon size={18} aria-hidden="true" className="shrink-0" /> : null}
    </button>
  )
}

type ButtonLinkProps = Omit<ButtonOwnProps, 'loading'> & Omit<LinkProps, 'children'>

/** A react-router Link styled as a design-system button (for navigation actions). */
export function ButtonLink({ variant = 'primary', size = 'md', icon: Icon, trailingIcon: TrailingIcon, fullWidth, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={buttonClassName({ variant, size, fullWidth, className })}>
      {Icon ? <Icon size={18} aria-hidden="true" className="shrink-0" /> : null}
      {children}
      {TrailingIcon ? <TrailingIcon size={18} aria-hidden="true" className="shrink-0" /> : null}
    </Link>
  )
}
