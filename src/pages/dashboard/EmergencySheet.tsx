import { Phone } from 'lucide-react'
import { buttonClassName, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'

/** European emergency number: explanation + a real `tel:112` link (the OS dialer asks before calling). */
export function EmergencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('dashboard.emergency.title')}>
      <p className="m-0 text-[15px] leading-[1.5] text-pretty text-text2">{t('dashboard.emergency.body')}</p>
      <a href="tel:112" className={buttonClassName({ variant: 'danger', fullWidth: true })}>
        <Phone size={18} aria-hidden="true" className="shrink-0" />
        {t('dashboard.emergency.call')}
      </a>
    </Sheet>
  )
}
