import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, BellRing, Mic, Send } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { Button, GlassCard, IconButton, ListRow, ListSection, PageHeader, StatusPill, useToast, type PillTone } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { toAppError } from '@/services/errors'
import { sendTestPush } from '@/services/notifications'
import { usePushSyncStore } from '@/services/notifications/syncState'
import { NotificationsSwitchRow } from './components/NotificationsSwitchRow'
import { useMicrophonePermission } from './useMicrophonePermission'
import { useNotificationToggle } from './useNotificationToggle'

type Tone = Extract<PillTone, 'success' | 'primary' | 'danger'>
type StatusKey = 'granted' | 'off' | 'blocked' | 'unavailable'

const TONE: Record<StatusKey, Tone> = { granted: 'success', off: 'primary', blocked: 'danger', unavailable: 'primary' }

/**
 * /settings/permissions — "Permissões": what the app needs on this device, with the real state of each permission and
 * the action to grant it. Opened by the "push notifications are available" notification (and from Definições).
 *  - Notificações: the browser permission (asked on the tap) + whether this device is registered for push + a test that
 *    goes through the real push service.
 *  - Microfone: used by the translator, Talk and chat voice messages.
 */
export default function PermissionsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const notifications = useNotificationToggle()
  const mic = useMicrophonePermission()
  const syncStatus = usePushSyncStore((s) => s.status)
  const retrySync = usePushSyncStore((s) => s.retry)
  const [testing, setTesting] = useState(false)

  const micStatus: StatusKey | null =
    mic.permission === null ? null : mic.permission === 'granted' ? 'granted' : mic.permission === 'denied' ? 'blocked' : mic.permission === 'unsupported' ? 'unavailable' : 'off'

  // Push delivery is only meaningful once notifications are on for this device.
  const pushVisible = notifications.checked && notifications.pushConfigured
  const pushActive = pushVisible && syncStatus === 'registered'
  const pushFailed = pushVisible && syncStatus === 'failed'

  const onTest = () => {
    setTesting(true)
    sendTestPush().then(
      () => toast.show(t('settings.permissions.push.testSent')),
      (err: unknown) => {
        const code = toAppError(err).code
        const key = code === 'not-found' ? 'testNone' : code === 'rate-limited' ? 'testWait' : 'testError'
        toast.show(t(`settings.permissions.push.${key}`), { duration: 3500 })
      },
    ).finally(() => setTesting(false))
  }

  let pushDescription = t('settings.permissions.push.inactive')
  if (pushFailed) pushDescription = t('settings.permissions.push.failed')
  else if (pushActive) pushDescription = t('settings.permissions.push.active')
  else if (pushVisible) pushDescription = t('settings.permissions.push.pending')

  let micDescription = t('settings.permissions.microphone.description')
  if (mic.permission === 'granted') micDescription = t('settings.permissions.microphone.granted')
  else if (mic.permission === 'unsupported') micDescription = t('settings.permissions.microphone.unsupported')
  else if (mic.failed) micDescription = t('settings.permissions.microphone.failed')

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-end gap-1">
        <IconButton variant="plain" icon={ArrowLeft} aria-label={t('settings.permissions.back')} onClick={() => void navigate(ROUTES.settings)} />
        <PageHeader title={t('settings.permissions.title')} className="min-w-0 flex-1" />
      </div>
      <p className="m-0 mx-1 text-[13px] leading-[1.4] text-pretty text-text3">{t('settings.permissions.intro')}</p>

      <ListSection title={t('settings.permissions.sections.notifications')}>
        <NotificationsSwitchRow notifications={notifications} />
        {notifications.pushConfigured && notifications.permission !== 'unsupported' ? (
          <ListRow
            icon={BellRing}
            label={t('settings.permissions.push.title')}
            description={pushDescription}
            trailing={
              pushActive ? (
                <StatusPill tone="success">{t('settings.permissions.status.granted')}</StatusPill>
              ) : pushFailed ? (
                <StatusPill tone="danger">{t('settings.permissions.status.unavailable')}</StatusPill>
              ) : (
                'none'
              )
            }
          />
        ) : null}
      </ListSection>

      {notifications.permission === 'default' && !notifications.checked ? (
        <Button icon={BellRing} fullWidth loading={notifications.requesting} onClick={() => notifications.toggle(true)}>
          {t('settings.permissions.notifications.allow')}
        </Button>
      ) : null}
      {pushFailed ? (
        <Button variant="secondary" fullWidth onClick={retrySync}>
          {t('settings.permissions.push.retry')}
        </Button>
      ) : null}
      {pushActive ? (
        <Button variant="secondary" icon={Send} fullWidth loading={testing} onClick={onTest}>
          {t('settings.permissions.push.test')}
        </Button>
      ) : null}

      <ListSection title={t('settings.permissions.sections.microphone')}>
        <ListRow
          icon={Mic}
          label={t('settings.permissions.sections.microphone')}
          description={micDescription}
          trailing={micStatus ? <StatusPill tone={TONE[micStatus]}>{t(`settings.permissions.status.${micStatus}`)}</StatusPill> : 'none'}
        />
      </ListSection>

      {mic.permission === 'prompt' || mic.requesting ? (
        <Button icon={Mic} fullWidth loading={mic.requesting} onClick={() => void mic.request()}>
          {t('settings.permissions.microphone.allow')}
        </Button>
      ) : null}
      {mic.permission === 'denied' ? (
        <GlassCard className="flex flex-col gap-2">
          <p className="m-0 text-sm leading-[1.5] text-text2">{t('settings.permissions.microphone.denied')}</p>
          <p className="m-0 text-[13px] leading-[1.5] text-text3">{t('settings.permissions.microphone.reenable')}</p>
        </GlassCard>
      ) : null}
    </div>
  )
}
