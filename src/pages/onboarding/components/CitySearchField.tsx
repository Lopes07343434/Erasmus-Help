import type { ReactNode, Ref } from 'react'
import { CircleCheck, MapPin, Search, WifiOff, CircleAlert } from 'lucide-react'
import { Button, GlassCard, OptionList, Spinner, TextField, type OptionItem } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { CITY_QUERY_MIN_LENGTH, getCountryName } from '@/services/geo'
import type { CityLocation } from '@/types/profile'
import { useCityPicker } from '../useCityPicker'

interface CitySearchFieldProps {
  countryCode: string | null
  value: CityLocation | null
  onChange: (city: CityLocation | null) => void
  /** glass = results in a glass card (over the page background) · plain = inside a sheet. */
  surface?: 'glass' | 'plain'
  inputRef?: Ref<HTMLInputElement>
}

const cityLabel = (city: { name: string; admin1?: string }) => (city.admin1 ? `${city.name}, ${city.admin1}` : city.name)

/**
 * City autocomplete (useCitySearch): idle hint · searching · results · not found · offline/error with
 * "use the typed name". Remount it with `key={countryCode}` when the country changes.
 */
export function CitySearchField({ countryCode, value, onChange, surface = 'glass', inputRef }: CitySearchFieldProps) {
  const { t, locale } = useI18n()
  const picker = useCityPicker({ countryCode, value, onChange })
  const { status, results } = picker.search
  const disabled = !countryCode

  let statusLine: ReactNode = null
  if (value) {
    statusLine = (
      <StatusLine icon={<CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" />}>
        {value.latitude !== undefined
          ? t('onboarding.location.city.selected', { city: cityLabel(value) })
          : t('onboarding.location.city.typedSelected', { city: value.name })}
      </StatusLine>
    )
  } else if (status === 'loading') {
    statusLine = <StatusLine icon={<Spinner size={16} className="text-primary" />}>{t('onboarding.location.city.searching')}</StatusLine>
  } else if (status === 'empty' && countryCode) {
    statusLine = <StatusLine>{t('onboarding.location.city.empty', { country: getCountryName(countryCode, locale) })}</StatusLine>
  } else if (status === 'offline' || status === 'error') {
    statusLine = (
      <div className="flex flex-col items-start gap-2.5">
        <StatusLine
          icon={
            status === 'offline' ? (
              <WifiOff size={16} aria-hidden="true" className="shrink-0 text-text3" />
            ) : (
              <CircleAlert size={16} aria-hidden="true" className="shrink-0 text-text3" />
            )
          }
        >
          {t(status === 'offline' ? 'onboarding.location.city.offline' : 'onboarding.location.city.error')}
        </StatusLine>
        {picker.canUseTyped ? (
          <Button variant="secondary" size="sm" onClick={picker.keepTyped}>
            {t('onboarding.location.city.useTyped', { city: picker.typed })}
          </Button>
        ) : null}
      </div>
    )
  }

  const showList = results.length > 0 && (status === 'success' || status === 'loading')
  const options: OptionItem<string>[] = results.map((r) => ({
    value: r.id,
    label: r.name,
    description: r.admin1,
    leading: <MapPin size={18} className="text-text3" />,
  }))
  const list = showList ? (
    <OptionList
      aria-label={t('onboarding.location.city.results')}
      options={options}
      value={picker.selectedId}
      onChange={picker.selectResult}
      autoFocusSelected={false}
    />
  ) : null

  return (
    <div className="flex flex-col">
      <TextField
        ref={inputRef}
        label={t('onboarding.location.city.label')}
        placeholder={t('onboarding.location.city.placeholder')}
        leadingIcon={Search}
        disabled={disabled}
        value={picker.query}
        onChange={(e) => picker.type(e.target.value)}
        onClear={picker.clear}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            picker.submit()
          }
        }}
        description={
          disabled
            ? t('onboarding.location.city.needsCountry')
            : status === 'idle' && !value
              ? t('onboarding.location.city.hint', { min: CITY_QUERY_MIN_LENGTH })
              : undefined
        }
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="search"
      />
      <div aria-live="polite" className="not-empty:mt-3">
        {statusLine}
      </div>
      {list ? (
        surface === 'glass' ? (
          <GlassCard padding="sm" shadow={false} className="mt-3">
            {list}
          </GlassCard>
        ) : (
          <div className="mt-3">{list}</div>
        )
      ) : null}
    </div>
  )
}

function StatusLine({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.4] text-text2">
      {icon ? <span className="mt-px flex shrink-0">{icon}</span> : null}
      <span className="min-w-0 text-pretty">{children}</span>
    </p>
  )
}
