import { BrandMark, Tagline, Wordmark } from '@/components/brand'
import { Button, OptionList, Sheet, type OptionItem } from '@/components/ui'
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

const IOS_STEPS = ['step1', 'step2', 'step3'] as const

/** iOS has no install prompt: manual "Add to Home Screen" steps. */
export function IosInstallSheet({ open, onClose }: BaseSheetProps) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('pwa.install.steps.ios.title')}>
      <p className="text-sm leading-[1.5] text-text2">{t('pwa.install.body')}</p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 pb-1">
        {IOS_STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-primary">
              {i + 1}
            </span>
            <span className="min-w-0 pt-[3px] text-[15px] leading-[1.45] text-text">{t(`pwa.install.steps.ios.${step}`)}</span>
          </li>
        ))}
      </ol>
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
