import { Bell } from 'lucide-react'
import { ListSwitchRow } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import type { useNotificationToggle } from '../useNotificationToggle'

/**
 * The notifications switch with its real state: asks the browser on the click, explains how to re-enable after a
 * refusal (per platform), and says that the app must be installed on iOS. Shared by Definições and Permissões.
 */
export function NotificationsSwitchRow({ notifications }: { notifications: ReturnType<typeof useNotificationToggle> }) {
  const { t } = useI18n()
  const install = useInstallPrompt()
  const unsupported = notifications.permission === 'unsupported'

  let description
  if (unsupported) {
    description = install.platform === 'ios' && !install.isStandalone ? t('pwa.notifications.iosInstallRequired') : t('pwa.notifications.states.unsupported.body')
  } else if (notifications.permission === 'denied') {
    description = (
      <>
        <span className="block font-semibold text-text2">{t('pwa.notifications.states.denied.title')}</span>
        {t(`pwa.notifications.reenable.${install.platform}`)}
      </>
    )
  } else if (notifications.requesting) {
    description = t('settings.notifications.requesting')
  } else if (notifications.checked) {
    description = notifications.pushConfigured ? t('settings.notifications.on') : t('pwa.notifications.pushUnavailable')
  } else {
    description = t('settings.notifications.off')
  }

  return (
    <ListSwitchRow
      icon={Bell}
      label={t('settings.notifications.label')}
      description={description}
      checked={notifications.checked}
      disabled={unsupported || notifications.requesting}
      onCheckedChange={notifications.toggle}
    />
  )
}
