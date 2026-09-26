import { LangBadge } from '@/components/ui'
import { FlagEmoji } from '@/components/ui/FlagEmoji'
import { useI18n } from '@/i18n/I18nProvider'
import { LANGUAGES, type LanguageInfo, type UiLocale } from '@/i18n/languages'
import { RadioCards, type RadioCardOption } from './RadioCards'

type UiLanguage = Extract<LanguageInfo, { ui: true }>
const UI_LANGUAGES: readonly UiLanguage[] = LANGUAGES.filter((l): l is UiLanguage => l.ui)

interface LanguageOptionsProps {
  value: UiLocale | null
  onChange: (code: UiLocale) => void
  'aria-labelledby'?: string
}

/** Português / English / Polski: flag + code badge + native name (+ the name in the current UI language when different). */
export function LanguageOptions({ value, onChange, ...aria }: LanguageOptionsProps) {
  const { languageName } = useI18n()
  const options: RadioCardOption<UiLocale>[] = UI_LANGUAGES.map((l) => {
    const localized = languageName(l.code)
    return {
      value: l.code,
      title: l.nativeName,
      lang: l.code,
      description: localized.toLocaleLowerCase() === l.nativeName.toLocaleLowerCase() ? undefined : localized,
      leading: (
        <span className="flex items-center gap-2">
          <FlagEmoji flag={l.flag} className="text-[24px] leading-none" />
          <LangBadge code={l.short} decorative />
        </span>
      ),
    }
  })
  return <RadioCards options={options} value={value} onChange={onChange} {...aria} />
}
