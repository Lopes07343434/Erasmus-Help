import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { useI18n } from '@/i18n/I18nProvider'
import { countryFlag, getCountryName } from '@/services/geo'
import { CountrySheet } from './CountrySheet'

interface CountryFieldProps {
  value: string | null
  onChange: (countryCode: string) => void
}

/** Field-like button (same look as TextField) that opens the country sheet. */
export function CountryField({ value, onChange }: CountryFieldProps) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const valueId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold text-text2">
        {t('onboarding.location.country.label')}
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen(true)}
        className="flex h-[50px] w-full items-center gap-2.5 rounded-control border border-solid border-border-strong bg-surface px-3.5 text-left text-[15px] font-medium text-text backdrop-blur-[16px] transition-[border-color,box-shadow] duration-200 hover:border-primary focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_var(--primary-soft)] focus-visible:outline-none"
      >
        {value ? (
          <span aria-hidden="true" className="text-[20px] leading-none">
            {countryFlag(value)}
          </span>
        ) : null}
        <span id={valueId} className={cn('min-w-0 flex-1 truncate', !value && 'text-text3')}>
          {value ? getCountryName(value, locale) : t('onboarding.location.country.placeholder')}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-text3" />
      </button>
      <CountrySheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onSelect={(code) => {
          onChange(code)
          setOpen(false)
        }}
      />
    </div>
  )
}
