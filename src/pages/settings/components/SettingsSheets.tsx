import { BrandMark, Tagline, Wordmark } from '@/components/brand'
import { Button, OptionList, Sheet, type OptionItem } from '@/components/ui'
import { IosInstallSteps } from '@/components/pwa/IosInstallSteps'
import { useI18n } from '@/i18n/I18nProvider'
import { LANGUAGES, type LanguageCode, type LanguageInfo, type UiLocale } from '@/i18n/languages'
import { APP_VERSION } from '../appVersion'

interface BaseSheetProps {
  open: boolean
  onClose: () => void
}

type UiLanguage = Extract<LanguageInfo, { ui: true }>
const UI_LANGUAGES: readonly UiLanguage[] = LANGUAGES.filter((l): l is UiLanguage => l.ui)

const differs = (a: string, b: string) => a.toLocaleLowerCase() !== b.toLocaleLowerCase()

/** Idioma da app: UI locales listed by their native name, so a user can always find their own language. */
export function AppLanguageSheet({ open, onClose, value, onSelect }: BaseSheetProps & { value: UiLocale; onSelect: (code: UiLocale) => void }) {
  const { t, languageName } = useI18n()
  const options: OptionItem<UiLocale>[] = UI_LANGUAGES.map((l) => ({
    value: l.code,
    label: l.nativeName,
    badge: l.short,
    description: differs(languageName(l.code), l.nativeName) ? languageName(l.code) : undefined,
  }))
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.languages.app')}>
      <p className="text-[13px] leading-[1.4] text-text3">{t('settings.languages.appSheetHint')}</p>
      <OptionList aria-label={t('settings.languages.app')} options={options} value={value} onChange={onSelect} />
    </Sheet>
  )
}

/** Idioma de conversa: every registry language (translator target, practice). */
export function ConversationLanguageSheet({
  open,
  onClose,
  value,
  onSelect,
}: BaseSheetProps & { value: LanguageCode; onSelect: (code: LanguageCode) => void }) {
  const { t, languageName } = useI18n()
  const options: OptionItem<LanguageCode>[] = LANGUAGES.map((l) => ({
    value: l.code,
    label: languageName(l.code),
    badge: l.short,
    description: differs(languageName(l.code), l.nativeName) ? l.nativeName : undefined,
  }))
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.languages.conversation')}>
      <p className="text-[13px] leading-[1.4] text-text3">{t('settings.languages.conversationSheetHint')}</p>
      <OptionList aria-label={t('settings.languages.conversation')} options={options} value={value} onChange={onSelect} />
    </Sheet>
  )
}

/** iOS has no install prompt: manual "Add to Home Screen" steps. */
export function IosInstallSheet({ open, onClose }: BaseSheetProps) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('pwa.install.steps.ios.title')}>
      <p className="text-sm leading-[1.5] text-text2">{t('pwa.install.body')}</p>
      <IosInstallSteps />
    </Sheet>
  )
}

/** "Sobre" sheet from the prototype: mark 64, wordmark 22, tagline, version and "Rever introdução". */
export function AboutSheet({ open, onClose, onReplayIntro }: BaseSheetProps & { onReplayIntro: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.app.aboutTitle')}>
      <div className="flex flex-col items-center gap-2.5 pt-2 pb-1 text-center">
        <BrandMark size={Math.round((64 * 121) / 128)} alt={t('common.appName')} />
        <Wordmark size="md" />
        <Tagline compact />
        <span className="text-[13px] text-text3">{t('settings.app.version', { version: APP_VERSION })}</span>
      </div>
      <div className="pb-1">
        <Button variant="secondary" fullWidth onClick={onReplayIntro}>
          {t('settings.app.replayIntro')}
        </Button>
      </div>
    </Sheet>
  )
}
