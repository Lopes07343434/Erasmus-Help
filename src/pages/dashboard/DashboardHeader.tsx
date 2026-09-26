import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, BellOff, UserRound } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { IconButton, PageHeader, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { initials } from '@/utils/validation'
import { capitalizeFirst, firstName, localIsoDate } from './dashboardText'

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }

/** Greeting header: today's date, "Olá, {first name}", notifications bell and profile avatar. */
export function DashboardHeader() {
  const { t, locale, formatDate } = useI18n()
  const name = useProfileStore((s) => s.name)
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled)
  const toast = useToast()
  const navigate = useNavigate()
  const [today] = useState(() => new Date())

  const first = firstName(name)
  const avatar = initials(name)

  const onBell = () => {
    // No notification feed exists yet: never show a fake unread badge or fake items.
    if (notificationsEnabled) toast.show(t('dashboard.notifications.none'))
    else toast.show(t('dashboard.notifications.off'), { icon: BellOff })
  }

  return (
    <PageHeader
      variant="greeting"
      overline={<time dateTime={localIsoDate(today)}>{capitalizeFirst(formatDate(today, DATE_FORMAT), locale)}</time>}
      title={first ? t('dashboard.greeting', { name: first }) : t('dashboard.greetingNoName')}
      actions={
        <>
          <IconButton variant="glass" icon={Bell} aria-label={t('dashboard.header.notifications')} onClick={onBell} />
          <IconButton
            variant="solid"
            icon={avatar ? undefined : UserRound}
            aria-label={t('dashboard.header.profile')}
            onClick={() => navigate(ROUTES.profile)}
          >
            {avatar ? <span aria-hidden="true">{avatar}</span> : null}
          </IconButton>
        </>
      }
    />
  )
}
