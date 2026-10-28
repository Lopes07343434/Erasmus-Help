import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { Download, Languages, MessagesSquare, Moon, ShieldCheck, Sun, UserCog } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { useChatSession } from '@/hooks/chat'
import { useResolvedTheme } from '@/app/ThemeController'
import { BrandMark } from '@/components/brand'
import { ListGroup, ListRow, ListSection, ListSectionTitle, ListSwitchRow, PageHeader, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import { useSettingsStore } from '@/stores/settingsStore'
import { NotificationsSwitchRow } from './components/NotificationsSwitchRow'
import { AboutSheet, AppLanguageSheet, ConversationLanguageSheet, IosInstallSheet } from './components/SettingsSheets'
import { useNotificationToggle } from './useNotificationToggle'

type SettingsSheet = 'appLanguage' | 'conversationLanguage' | 'install' | 'about'

/** /settings — "Definições": appearance, languages, notifications and app (install, about). */
export default function SettingsPage() {
  const { t, languageName } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const languagesTitleId = useId()
  const [sheet, setSheet] = useState<SettingsSheet | null>(null)
  const close = () => setSheet(null)

  const resolvedTheme = useResolvedTheme()
  const setTheme = useSettingsStore((s) => s.setTheme)
  const appLanguage = useSettingsStore((s) => s.appLanguage)
  const setAppLanguage = useSettingsStore((s) => s.setAppLanguage)
  const conversationLanguage = useSettingsStore((s) => s.conversationLanguage)
  const setConversationLanguage = useSettingsStore((s) => s.setConversationLanguage)

  const notifications = useNotificationToggle()
  const install = useInstallPrompt()
  const isChatAdmin = useChatSession().me?.role === 'admin'
  const dark = resolvedTheme === 'dark'

  const showInstall = !install.installed && (install.canInstall || install.platform === 'ios')
  const onInstall = () => {
    if (!install.canInstall) return setSheet('install')
    void install.promptInstall().then((outcome) => {
      if (outcome === 'accepted') toast.show(t('settings.app.installedToast'))
    })
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title={t('settings.title')} />

      <ListSection title={t('settings.sections.appearance')}>
        <ListSwitchRow
          icon={dark ? Moon : Sun}
          label={t('settings.appearance.darkMode')}
          checked={dark}
          onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')}
        />
      </ListSection>

      <section aria-labelledby={languagesTitleId} className="flex flex-col gap-2">
        <ListSectionTitle id={languagesTitleId}>{t('settings.sections.languages')}</ListSectionTitle>
        <ListGroup>
          <ListRow icon={Languages} label={t('settings.languages.app')} value={languageName(appLanguage)} onClick={() => setSheet('appLanguage')} />
          <ListRow
            icon={MessagesSquare}
            label={t('settings.languages.conversation')}
            value={languageName(conversationLanguage)}
            onClick={() => setSheet('conversationLanguage')}
          />
        </ListGroup>
        <p className="mx-1 text-[13px] leading-[1.4] text-pretty text-text3">{t('settings.languages.caption')}</p>
      </section>

      <ListSection title={t('settings.sections.notifications')}>
        <NotificationsSwitchRow notifications={notifications} />
        <ListRow icon={ShieldCheck} label={t('settings.permissions.rowLabel')} description={t('settings.permissions.rowHint')} to={ROUTES.permissions} />
      </ListSection>

      <ListSection title={t('settings.sections.app')}>
        {showInstall ? (
          <ListRow key="install" icon={Download} label={t('pwa.install.title')} description={t('settings.app.installHint')} onClick={onInstall} />
        ) : null}
        <ListRow
          key="about"
          leading={<BrandMark size={18} className="shrink-0" />}
          label={t('settings.app.about')}
          onClick={() => setSheet('about')}
        />
      </ListSection>

      {isChatAdmin ? (
        <ListSection title={t('chat.settings.section')}>
          <ListRow icon={UserCog} label={t('chat.settings.adminRow')} description={t('chat.settings.adminHint')} to={ROUTES.admin} />
        </ListSection>
      ) : null}

      <AppLanguageSheet
        open={sheet === 'appLanguage'}
        onClose={close}
        value={appLanguage}
        onSelect={(code) => {
          setAppLanguage(code)
          close()
        }}
      />
      <ConversationLanguageSheet
        open={sheet === 'conversationLanguage'}
        onClose={close}
        value={conversationLanguage}
        onSelect={(code) => {
          setConversationLanguage(code)
          close()
        }}
      />
      <IosInstallSheet open={sheet === 'install'} onClose={close} />
      <AboutSheet open={sheet === 'about'} onClose={close} onReplayIntro={() => void navigate(`${ROUTES.welcome}?intro=1`)} />
    </div>
  )
}
