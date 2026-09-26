import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'
export type ButtonSize = 'md' | 'sm'

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** Visual disabled look (not applied while loading: the loading button keeps its colours). */
  disabled?: boolean
  className?: string
}

const base =
  'inline-flex items-center justify-center gap-2 text-center leading-[1.2] font-semibold no-underline select-none transition duration-150 disabled:cursor-default'

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: 'min-h-[52px] px-6 py-2 rounded-control text-base', sm: 'min-h-11 px-[18px] py-1.5 rounded-control text-[15px]' },
  danger: { md: 'min-h-[52px] px-6 py-2 rounded-control text-base', sm: 'min-h-11 px-[18px] py-1.5 rounded-control text-[15px]' },
  secondary: { md: 'min-h-[52px] px-6 py-2 rounded-control text-[15px]', sm: 'min-h-11 px-[18px] py-1.5 rounded-control text-[15px]' },
  dangerGhost: { md: 'min-h-12 px-4 py-2 rounded-control text-[15px]', sm: 'min-h-11 px-3 py-1.5 rounded-control text-[15px]' },
  ghost: { md: 'min-h-11 px-3 py-1.5 rounded-chip text-[15px]', sm: 'min-h-11 px-3 py-1.5 rounded-chip text-[15px]' },
}

const enabled: Record<ButtonVariant, string> = {
  primary: 'border-0 bg-grad text-white shadow-[0_12px_24px_-12px_var(--primary)] hover:brightness-106 active:scale-[.98] active:brightness-94',
  danger: 'border-0 bg-danger text-white hover:brightness-106 active:scale-[.98]',
  secondary:
    'border border-solid border-border-strong bg-transparent text-primary hover:bg-primary/6 active:scale-[.98] active:border-primary active:bg-primary-soft',
  ghost: 'border-0 bg-transparent text-primary hover:bg-primary/8 active:bg-primary/14',
  dangerGhost: 'border-0 bg-transparent text-danger hover:bg-danger-soft active:scale-[.98]',
}

const disabledLook: Record<ButtonVariant, string> = {
  primary: 'border-0 bg-(--disabled-bg) text-(--disabled-text)',
  danger: 'border-0 bg-(--disabled-bg) text-(--disabled-text)',
  secondary: 'border border-solid border-border bg-transparent text-text3/60',
  ghost: 'border-0 bg-transparent text-text3/60',
  dangerGhost: 'border-0 bg-transparent text-text3/60',
}

/** Class list for a design-system button. Use it to style a router `Link` like a button (see `ButtonLink`). */
export function buttonClassName({ variant = 'primary', size = 'md', fullWidth, disabled, className }: ButtonStyleOptions = {}): string {
  return cn(base, sizes[variant][size], disabled ? disabledLook[variant] : enabled[variant], fullWidth && 'w-full', className)
}
