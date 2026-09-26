import type { UiLocale } from '@/i18n/languages'

/** First word of the user's name ("Ana Maria Silva" → "Ana"); '' when there is no name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

/** Upper-cases the first character with the locale's rules ("quinta-feira, 25 de setembro" → "Quinta-feira, …"). */
export function capitalizeFirst(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

/**
 * Whether language names are written in lower case inside a sentence ("Pratica inglês", "Ćwicz angielski"
 * but "Practise English"). A Record, so adding a UI locale forces a decision here.
 */
const LOWERCASE_LANGUAGE_NAMES: Readonly<Record<UiLocale, boolean>> = {
  'pt-PT': true,
  en: false,
  pl: true,
}

/** A language name (as stored in the `languages` namespace) ready to be used mid-sentence. */
export function languageNameInSentence(name: string, locale: UiLocale): string {
  return LOWERCASE_LANGUAGE_NAMES[locale] ? name.toLocaleLowerCase(locale) : name
}

/** Local calendar date as YYYY-MM-DD (for `<time dateTime>`). */
export function localIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
