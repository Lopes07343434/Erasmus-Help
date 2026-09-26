import { cn } from './cn'

interface SpinnerProps {
  /** Diameter in px (design: 16 inside buttons). */
  size?: number
  /** Optional accessible label; without it the spinner is decorative. */
  label?: string
  className?: string
}

/** Ring spinner from the Design System sheet: 2px ring in currentColor at low opacity with an opaque top segment. */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const ring = (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 animate-eh-spin rounded-full border-2 border-solid"
      style={{
        width: size,
        height: size,
        borderColor: 'color-mix(in srgb, currentColor 30%, transparent)',
        borderTopColor: 'currentColor',
      }}
    />
  )
  if (!label) return <span className={cn('inline-flex', className)}>{ring}</span>
  return (
    <span role="status" className={cn('inline-flex', className)}>
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  )
}
