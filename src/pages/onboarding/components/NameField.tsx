import type { Ref } from 'react'
import { TextField } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { NAME_MAX_LENGTH } from '@/types/profile'
import { validateName } from '@/utils/validation'

interface NameFieldProps {
  value: string
  onChange: (value: string) => void
  /** Enter key. */
  onSubmit?: () => void
  /** Show validation messages (after the user has typed or tried to continue). */
  showErrors: boolean
  autoFocus?: boolean
  hideLabel?: boolean
  inputRef?: Ref<HTMLInputElement>
}

/** Name input with validateName messages (empty / tooLong / invalid), announced politely. */
export function NameField({ value, onChange, onSubmit, showErrors, autoFocus, hideLabel, inputRef }: NameFieldProps) {
  const { t } = useI18n()
  const result = validateName(value)
  const error = showErrors && !result.ok ? t(`onboarding.name.errors.${result.reason}`, { max: NAME_MAX_LENGTH }) : undefined

  return (
    <div className="flex flex-col">
      <TextField
        ref={inputRef}
        label={t('onboarding.name.label')}
        hideLabel={hideLabel}
        placeholder={t('onboarding.name.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        error={error}
        autoFocus={autoFocus}
        autoComplete="name"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="next"
        maxLength={NAME_MAX_LENGTH + 20}
      />
      <p aria-live="polite" className="sr-only">
        {error ?? ''}
      </p>
    </div>
  )
}
