import type { ComponentPropsWithRef } from 'react'
import { cn } from './cn'

/** Visual-only 48×28 track with a 22px knob. Use inside an element that carries role="switch". */
export function SwitchTrack({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-block h-7 w-12 shrink-0 rounded-full transition-[background-color] duration-200',
        checked ? 'bg-primary' : 'bg-border-strong',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </span>
  )
}

type SwitchProps = Omit<ComponentPropsWithRef<'button'>, 'onChange' | 'role' | 'aria-checked' | 'children'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
} & ({ 'aria-label': string } | { 'aria-labelledby': string })

/** Standalone switch (role="switch"). For settings rows prefer `ListSwitchRow`, where the whole row is the switch. */
export function Switch({ checked, onCheckedChange, className, disabled, onClick, type = 'button', ...rest }: SwitchProps) {
  return (
    <button
      {...rest}
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) onCheckedChange(!checked)
      }}
      className={cn('inline-flex shrink-0 rounded-full border-0 bg-transparent p-0', disabled && 'opacity-50', className)}
    >
      <SwitchTrack checked={checked} />
    </button>
  )
}
