/**
 * Language registry — the single list of languages the product knows.
 *
 * Three separate concepts use this registry and must never be mixed:
 *  - appLanguage          (settings store): language of menus/buttons/texts. Only entries with `ui: true`.
 *  - myLanguage           (profile store):  the user's main language (Onboarding Q3).
 *  - conversationLanguage (settings store): language used to communicate / translate into.
 *
 * Adding a language:
 *  1. add an entry below (code = BCP 47);
 *  2. add its localized name to the `languages` namespace of every UI locale;
 *  3. add its panel strings in i18n/panel.ts (Conversar com pessoa);
 *  4. to make it a UI language: set `ui: true` and add a full message folder in i18n/messages/<code>.
 */
export const LANGUAGES = [
  { code: 'pt-PT', short: 'PT', flag: '🇵🇹', nativeName: 'Português', speechTag: 'pt-PT', ui: true },
  { code: 'en', short: 'EN', flag: '🇬🇧', nativeName: 'English', speechTag: 'en-GB', ui: true },
  { code: 'pl', short: 'PL', flag: '🇵🇱', nativeName: 'Polski', speechTag: 'pl-PL', ui: true },
  { code: 'es', short: 'ES', flag: '🇪🇸', nativeName: 'Español', speechTag: 'es-ES', ui: false },
  { code: 'fr', short: 'FR', flag: '🇫🇷', nativeName: 'Français', speechTag: 'fr-FR', ui: false },
  { code: 'de', short: 'DE', flag: '🇩🇪', nativeName: 'Deutsch', speechTag: 'de-DE', ui: false },
  { code: 'it', short: 'IT', flag: '🇮🇹', nativeName: 'Italiano', speechTag: 'it-IT', ui: false },
] as const

export type LanguageInfo = (typeof LANGUAGES)[number]
export type LanguageCode = LanguageInfo['code']
export type UiLocale = Extract<LanguageInfo, { ui: true }>['code']

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((l) => l.code)
export const UI_LOCALES: readonly UiLocale[] = LANGUAGES.filter((l): l is Extract<LanguageInfo, { ui: true }> => l.ui).map((l) => l.code)

export const DEFAULT_UI_LOCALE: UiLocale = 'en'

export function getLanguage(code: LanguageCode): LanguageInfo {
  const found = LANGUAGES.find((l) => l.code === code)
  if (!found) throw new Error(`Unknown language ${code}`)
  return found
}

export const isLanguageCode = (v: unknown): v is LanguageCode => typeof v === 'string' && (LANGUAGE_CODES as readonly string[]).includes(v)
export const isUiLocale = (v: unknown): v is UiLocale => typeof v === 'string' && (UI_LOCALES as readonly string[]).includes(v)

/** Best UI locale for the browser: exact match, then base-language match (pt-BR → pt-PT), else English. */
export function detectUiLocale(preferred: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : []): UiLocale {
  for (const tag of preferred) {
    if (isUiLocale(tag)) return tag
    const base = tag.toLowerCase().split('-')[0]
    const match = UI_LOCALES.find((l) => l.toLowerCase().split('-')[0] === base)
    if (match) return match
  }
  return DEFAULT_UI_LOCALE
}
