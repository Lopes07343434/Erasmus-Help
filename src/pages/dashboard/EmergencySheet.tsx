import { Phone } from 'lucide-react'
import { buttonClassName, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { getCountryName, getEmergencyNumbers } from '@/services/geo'
import { useProfileStore } from '@/stores/profileStore'

type Service = 'police' | 'ambulance' | 'fire'
const SERVICES: readonly Service[] = ['police', 'ambulance', 'fire']

/**
 * Emergency numbers of the country the user lives in (profile location), with real `tel:` links (the OS
 * dialer asks before calling). Without a location it falls back to the European 112.
 */
export function EmergencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n()
  const countryCode = useProfileStore((s) => s.location?.countryCode ?? null)
  const numbers = getEmergencyNumbers(countryCode)
  const services = SERVICES.flatMap((key) => {
    const number = numbers[key]
    return number ? [{ key, number }] : []
  })

  return (
    <Sheet open={open} onClose={onClose} title={t('dashboard.emergency.title')}>
      <p className="m-0 text-[15px] leading-[1.5] text-pretty text-text2">
        {countryCode
          ? t('dashboard.emergency.bodyCountry', { country: getCountryName(countryCode, locale), number: numbers.general })
          : t('dashboard.emergency.body')}
      </p>
      <a href={`tel:${numbers.general}`} className={buttonClassName({ variant: 'danger', fullWidth: true })}>
        <Phone size={18} aria-hidden="true" className="shrink-0" />
        {t('dashboard.emergency.call', { number: numbers.general })}
      </a>
      {services.length > 0 && (
        <section aria-label={t('dashboard.emergency.services')} className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-semibold tracking-[0.04em] text-text3 uppercase">{t('dashboard.emergency.services')}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {services.map(({ key, number }) => (
              <li key={key}>
                <a
                  href={`tel:${number}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 py-2 text-[15px] font-medium text-text no-underline"
                >
                  <span>{t(`dashboard.emergency.${key}`)}</span>
                  <span className="font-semibold text-danger tabular-nums">{number}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {numbers.general !== '112' && <p className="m-0 text-[13px] leading-[1.45] font-medium text-text3">{t('dashboard.emergency.anyPhone')}</p>}
    </Sheet>
  )
}
