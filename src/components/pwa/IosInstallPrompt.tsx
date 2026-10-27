import { Button, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useIosInstallPrompt } from '@/pwa/useIosInstallPrompt'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Opens by itself when the site is visited in the iOS browser and the app is not installed yet.
 * iOS cannot install a web app programmatically, so this is the guided "Add to Home Screen" flow.
 * Mount once, inside I18nProvider.
 */
export function IosInstallPrompt() {
  const { t } = useI18n()
  const { open, dismiss } = useIosInstallPrompt()
  return (
    <Sheet open={open} onClose={dismiss} title={t('pwa.install.steps.ios.title')}>
      <p className="text-sm leading-[1.5] text-text2">{t('pwa.install.body')}</p>
      <IosInstallSteps />
      <p className="text-[13px] leading-[1.4] text-text3">{t('pwa.install.iosHint')}</p>
      <Button variant="secondary" fullWidth onClick={dismiss}>
        {t('pwa.install.later')}
      </Button>
    </Sheet>
  )
}
