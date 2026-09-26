import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguageCode } from '@/i18n/languages'
import { languageNameIn } from '@/i18n/panel'

/** Language name for use inside a UI sentence ("A traduzir para espanhol", "Translating into Spanish"). */
export function useInlineLanguageName(): (code: LanguageCode) => string {
  const { locale, languageName } = useI18n()
  return (code) => languageNameIn(locale, code) ?? languageName(code)
}

/** Short viewports (small phones, landscape): the spheres shrink so the page fits without scrolling. */
export const useShortViewport = () => useMediaQuery('(max-height: 700px)')
