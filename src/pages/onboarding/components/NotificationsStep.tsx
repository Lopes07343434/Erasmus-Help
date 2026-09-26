import { Bell, BellOff, CircleCheck, Info } from 'lucide-react'
import { Button, GlassCard, IconTile, StatusPill } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { InstallPlatform } from '@/pwa/useInstallPrompt'
import type { NotificationPermissionState } from '@/services/notifications'

interface NotificationsStepProps {
  permission: NotificationPermissionState
  requesting: boolean
  /** The question is answered (asked in this flow, or the browser already has a final state). */
  decided: boolean
  platform: InstallPlatform
  isStandalone: boolean
  /** Must trigger the real browser prompt from the click. */
  onAllow: () => void
  onDecline: () => void
}

/** Optional notifications question: ask (allow / not now), then the real outcome reported by the browser. */
export function NotificationsStep({ permission, requesting, decided, platform, isStandalone, onAllow, onDecline }: NotificationsStepProps) {
  const { t } = useI18n()

  if (!decided) {
    return (
      <div className="flex flex-col gap-3">
        <Button icon={Bell} fullWidth loading={requesting} onClick={onAllow}>
          {t('onboarding.notifications.allow')}
        </Button>
        <Button variant="secondary" fullWidth disabled={requesting} onClick={onDecline}>
          {t('common.actions.notNow')}
        </Button>
        <p className="m-0 text-center text-[13px] text-text3">{t('pwa.notifications.ask.hint')}</p>
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite">
      <Outcome permission={permission} platform={platform} isStandalone={isStandalone} />
    </div>
  )
}

function Outcome({ permission, platform, isStandalone }: { permission: NotificationPermissionState; platform: InstallPlatform; isStandalone: boolean }) {
  const { t } = useI18n()

  if (permission === 'granted') {
    return (
      <GlassCard className="flex flex-col items-start gap-2.5">
        <StatusPill tone="success" icon={CircleCheck}>
          {t('pwa.notifications.states.granted.title')}
        </StatusPill>
        <p className="m-0 text-sm leading-[1.5] text-text2">{t('pwa.notifications.states.granted.body')}</p>
      </GlassCard>
    )
  }

  if (permission === 'denied') {
    return (
      <GlassCard className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <IconTile icon={BellOff} />
          <p className="m-0 min-w-0 text-base font-semibold">{t('pwa.notifications.states.denied.title')}</p>
        </div>
        <p className="m-0 text-sm leading-[1.5] text-text2">{t('pwa.notifications.states.denied.body')}</p>
        <p className="m-0 text-[13px] font-semibold text-text2">{t('pwa.notifications.reenable.title')}</p>
        <p className="m-0 text-[13px] leading-[1.5] text-text3">{t(`pwa.notifications.reenable.${platform}`)}</p>
      </GlassCard>
    )
  }

  if (permission === 'unsupported') {
    return (
      <GlassCard className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <IconTile icon={Info} />
          <p className="m-0 min-w-0 text-base font-semibold">{t('pwa.notifications.states.unsupported.title')}</p>
        </div>
        <p className="m-0 text-sm leading-[1.5] text-text2">
          {platform === 'ios' && !isStandalone ? t('pwa.notifications.iosInstallRequired') : t('pwa.notifications.states.unsupported.body')}
        </p>
      </GlassCard>
    )
  }

  // Still 'default' after asking: the prompt was dismissed without an answer.
  return (
    <GlassCard className="flex items-center gap-3">
      <IconTile icon={BellOff} />
      <p className="m-0 min-w-0 text-sm leading-[1.5] text-text2">{t('onboarding.notifications.dismissed')}</p>
    </GlassCard>
  )
}
