import { useRef } from 'react'
import { Globe, HardDrive, MicOff, Trash2, UserRoundX, type LucideIcon } from 'lucide-react'
import { Button, IconTile, OptionList, Sheet, type OptionItem } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { LANGUAGES, type LanguageCode } from '@/i18n/languages'
import { CitySearchField } from '@/pages/onboarding/components/CitySearchField'
import { RoleOptions } from '@/pages/onboarding/components/RoleOptions'
import { getCountryName } from '@/services/geo'
import type { CityLocation, UserRole } from '@/types/profile'

interface BaseSheetProps {
  open: boolean
  onClose: () => void
}

/** Função: selecting saves; click/Enter also closes (arrow keys only move the selection). */
export function RoleSheet({ open, onClose, value, onChange }: BaseSheetProps & { value: UserRole | null; onChange: (role: UserRole) => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.sheets.role')}>
      <div className="pb-1">
        <RoleOptions value={value} onChange={onChange} onActivate={onClose} aria-label={t('profile.sheets.role')} />
      </div>
    </Sheet>
  )
}

/** Meu idioma: any registry language (not the app language). */
export function MyLanguageSheet({
  open,
  onClose,
  value,
  onSelect,
}: BaseSheetProps & { value: LanguageCode | null; onSelect: (code: LanguageCode) => void }) {
  const { t, languageName } = useI18n()
  const options: OptionItem<LanguageCode>[] = LANGUAGES.map((l) => {
    const name = languageName(l.code)
    return {
      value: l.code,
      label: name,
      badge: l.short,
      description: name.toLocaleLowerCase() === l.nativeName.toLocaleLowerCase() ? undefined : l.nativeName,
    }
  })
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.sheets.myLanguage')}>
      <p className="m-0 text-[13px] leading-[1.4] text-text3">{t('profile.sheets.myLanguageHint')}</p>
      <OptionList aria-label={t('profile.sheets.myLanguage')} options={options} value={value} onChange={onSelect} />
    </Sheet>
  )
}

/** Cidade: city autocomplete for `countryCode`; a picked city (or the typed name when offline) is saved at once. */
export function CitySheet({
  open,
  onClose,
  countryCode,
  value,
  onSelect,
}: BaseSheetProps & { countryCode: string | null; value: CityLocation | null; onSelect: (city: CityLocation) => void }) {
  const { t, locale } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const title = countryCode ? t('profile.sheets.cityIn', { country: getCountryName(countryCode, locale) }) : t('profile.fields.city')
  return (
    <Sheet open={open} onClose={onClose} title={title} initialFocusRef={inputRef}>
      <div className="pb-1">
        <CitySearchField
          key={countryCode ?? 'none'}
          countryCode={countryCode}
          value={value}
          onChange={(city) => {
            if (city) onSelect(city)
          }}
          surface="plain"
          inputRef={inputRef}
        />
      </div>
    </Sheet>
  )
}

const PRIVACY_BLOCKS: ReadonlyArray<{ key: 'device' | 'account' | 'audio' | 'services'; icon: LucideIcon }> = [
  { key: 'device', icon: HardDrive },
  { key: 'account', icon: UserRoundX },
  { key: 'audio', icon: MicOff },
  { key: 'services', icon: Globe },
]

/** Privacidade e dados: what is stored where (local only, no accounts, no audio, external services). */
export function PrivacySheet({ open, onClose }: BaseSheetProps) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.privacy.title')}>
      <ul className="m-0 flex list-none flex-col gap-4 p-0 pb-1">
        {PRIVACY_BLOCKS.map(({ key, icon }) => (
          <li key={key} className="flex items-start gap-3">
            <IconTile icon={icon} />
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="m-0 text-[15px] font-semibold">{t(`profile.privacy.${key}.title`)}</h3>
              <p className="m-0 text-sm leading-[1.5] text-pretty text-text2">{t(`profile.privacy.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** Confirmation before wiping this device's data. */
export function DeleteDataSheet({ open, onClose, onConfirm }: BaseSheetProps & { onConfirm: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.deleteData.title')}>
      <p className="m-0 text-[15px] leading-[1.5] text-pretty text-text2">{t('profile.deleteData.body')}</p>
      <p className="m-0 text-sm leading-[1.5] font-semibold text-pretty text-danger">{t('profile.deleteData.warning')}</p>
      <div className="flex flex-col gap-2.5 pt-1 pb-1">
        <Button variant="danger" icon={Trash2} fullWidth onClick={onConfirm}>
          {t('profile.deleteData.confirm')}
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          {t('common.actions.cancel')}
        </Button>
      </div>
    </Sheet>
  )
}
