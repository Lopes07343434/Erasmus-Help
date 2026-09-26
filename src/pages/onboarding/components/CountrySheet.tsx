import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { EmptyState } from '@/components/feedback'
import { LangBadge, OptionList, Sheet, TextField, type OptionItem } from '@/components/ui'
import { FlagEmoji } from '@/components/ui/FlagEmoji'
import { useI18n } from '@/i18n/I18nProvider'
import { searchCountries } from '@/services/geo'

interface CountrySheetProps {
  open: boolean
  onClose: () => void
  value: string | null
  /** Called with the ISO code; the caller decides whether to close the sheet. */
  onSelect: (countryCode: string) => void
  title?: string
}

/** Country picker sheet: search field (name, English name, native name or code) + list with flags. */
export function CountrySheet({ open, onClose, value, onSelect, title }: CountrySheetProps) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const sheetTitle = title ?? t('onboarding.location.country.sheetTitle')

  const options = useMemo<OptionItem<string>[]>(
    () =>
      searchCountries(query, locale).map((c) => ({
        value: c.code,
        label: c.name,
        leading: (
          <FlagEmoji
            flag={c.flag}
            className="block w-7 text-center text-[20px] leading-none"
            fallback={<LangBadge code={c.code} decorative />}
          />
        ),
      })),
    [query, locale],
  )

  const close = () => {
    setQuery('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={sheetTitle} initialFocusRef={value ? undefined : searchRef}>
      <div className="sticky top-0 z-(--z-content) bg-surface-solid pb-1">
        <TextField
          ref={searchRef}
          label={t('onboarding.location.country.search')}
          hideLabel
          placeholder={t('onboarding.location.country.search')}
          leadingIcon={Search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>
      {options.length > 0 ? (
        <OptionList
          aria-label={sheetTitle}
          options={options}
          value={value}
          onChange={(code) => {
            setQuery('')
            onSelect(code)
          }}
        />
      ) : (
        <EmptyState
          icon={Search}
          title={t('onboarding.location.country.emptyTitle')}
          body={t('onboarding.location.country.emptyBody')}
          className="py-6"
        />
      )}
    </Sheet>
  )
}
