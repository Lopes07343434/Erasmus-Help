import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, X, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from './cn'

type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'size' | 'children'> & {
  label: string
  /** Keep the label for screen readers only (e.g. a search field with a visible placeholder). */
  hideLabel?: boolean
  /** Helper text under the field (12px text3). Replaced by `error`/`success` when present. */
  description?: ReactNode
  /** Error message: danger border + icon, aria-invalid. */
  error?: ReactNode
  /** Success message: success border + icon. */
  success?: ReactNode
  /** Leading icon inside the field (18px text3), e.g. Search. */
  leadingIcon?: LucideIcon
  /** Shows a clear (X) button while the controlled `value` is non-empty. */
  onClear?: () => void
  /** Accessible name of the clear button (default common.actions.clear). */
  clearLabel?: string
  /** Class for the outer wrapper (layout only). */
  className?: string
}

/** Text input from the Design System sheet (h50, radius 14, focus ring 4px primary-soft). Forwards `ref` and native props. */
export function TextField({
  label,
  hideLabel,
  description,
  error,
  success,
  leadingIcon: LeadingIcon,
  onClear,
  clearLabel,
  className,
  id,
  disabled,
  value,
  'aria-describedby': describedByProp,
  ...inputProps
}: TextFieldProps) {
  const { t } = useI18n()
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-message`
  const hasError = error !== undefined && error !== null && error !== false
  const hasSuccess = !hasError && success !== undefined && success !== null && success !== false
  const message = hasError ? error : hasSuccess ? success : description
  const showClear = !!onClear && !disabled && value !== undefined && value !== null && String(value).length > 0
  const StatusIcon = hasError ? CircleAlert : hasSuccess ? CircleCheck : null
  const describedBy = cn(describedByProp, message ? messageId : undefined) || undefined

  return (
    <div className={cn('group flex flex-col gap-1.5', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          'text-[13px] font-semibold transition-colors duration-200',
          hideLabel && 'sr-only',
          disabled ? 'text-text3/60' : hasError ? 'text-danger' : 'text-text2 group-focus-within:text-primary',
        )}
      >
        {label}
      </label>
      <div className="relative">
        {LeadingIcon ? (
          <LeadingIcon size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 z-(--z-content) -translate-y-1/2 text-text3" />
        ) : null}
        <input
          {...inputProps}
          id={inputId}
          value={value}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-[50px] w-full rounded-control border border-solid px-3.5 font-sans text-[15px] font-medium outline-none backdrop-blur-[16px] transition-[border-color,box-shadow] duration-200 placeholder:text-text3',
            LeadingIcon && 'pl-[42px]',
            (showClear || StatusIcon) && 'pr-11',
            disabled
              ? 'border-border bg-bg text-text3/60'
              : hasError
                ? 'border-danger bg-surface text-text focus:shadow-[0_0_0_4px_var(--danger-soft)]'
                : hasSuccess
                  ? 'border-success bg-surface text-text focus:shadow-[0_0_0_4px_var(--success-soft)]'
                  : 'border-border-strong bg-surface text-text focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-soft)]',
          )}
        />
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel ?? t('common.actions.clear')}
            className="absolute top-[3px] right-1 grid size-11 place-items-center rounded-chip border-0 bg-transparent text-text3"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : StatusIcon ? (
          <StatusIcon
            size={18}
            aria-hidden="true"
            className={cn('pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2', hasError ? 'text-danger' : 'text-success')}
          />
        ) : null}
      </div>
      {message ? (
        <p id={messageId} className={cn('m-0 min-h-4 text-xs', hasError ? 'text-danger' : hasSuccess ? 'text-success' : 'text-text3')}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
