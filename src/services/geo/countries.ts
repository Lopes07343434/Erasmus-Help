import type { LanguageCode } from '@/i18n/languages'
import { foldText } from './text'

/**
 * Countries offered in onboarding: Erasmus+ programme countries.
 *  - EU-27;
 *  - associated third countries: IS, LI, NO, MK, RS, TR;
 *  - GB and CH (not programme countries, but very common Erasmus-style exchange destinations).
 * ISO 3166-1 alpha-2 (Greece is GR, not the EU's "EL"; the UK is GB, not "UK").
 */
export const COUNTRY_CODES = [
  // EU-27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // Associated to Erasmus+
  'IS', 'LI', 'NO', 'MK', 'RS', 'TR',
  // Common exchange destinations outside the programme
  'GB', 'CH',
] as const

export type SupportedCountryCode = (typeof COUNTRY_CODES)[number]

export interface Country {
  code: SupportedCountryCode
  /** Name in the requested UI locale (Intl.DisplayNames). */
  name: string
  /** Regional-indicator emoji flag. */
  flag: string
}

export const isSupportedCountry = (v: unknown): v is SupportedCountryCode =>
  typeof v === 'string' && (COUNTRY_CODES as readonly string[]).includes(v)

/** "PT" → "🇵🇹". Returns '' for anything that is not two ASCII letters. */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return ''
  return String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function displayNames(locale: string): Intl.DisplayNames | null {
  if (!displayNamesCache.has(locale)) {
    let dn: Intl.DisplayNames | null = null
    try {
      dn = new Intl.DisplayNames([locale, 'en'], { type: 'region', fallback: 'code' })
    } catch {
      dn = null
    }
    displayNamesCache.set(locale, dn)
  }
  return displayNamesCache.get(locale) ?? null
}

/** Localised country name; falls back to the code when the browser has no data. */
export function getCountryName(code: string, locale: string): string {
  try {
    return displayNames(locale)?.of(code) ?? code
  } catch {
    return code
  }
}

const listCache = new Map<string, readonly Country[]>()

/** Supported countries with localised names, sorted with the locale's collation. Memoised per locale. */
export function getCountries(locale: string): readonly Country[] {
  const hit = listCache.get(locale)
  if (hit) return hit
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  const list = COUNTRY_CODES.map((code) => ({ code, name: getCountryName(code, locale), flag: countryFlag(code) })).sort((a, b) =>
    collator.compare(a.name, b.name),
  )
  listCache.set(locale, list)
  return list
}

/** Main language of each country, used only to also match the native name ("Deutschland", "Polska", "España"). */
const ENDONYM_LOCALE: Readonly<Record<SupportedCountryCode, string>> = {
  AT: 'de', BE: 'nl', BG: 'bg', HR: 'hr', CY: 'el', CZ: 'cs', DK: 'da', EE: 'et', FI: 'fi', FR: 'fr', DE: 'de', GR: 'el',
  HU: 'hu', IE: 'en', IT: 'it', LV: 'lv', LT: 'lt', LU: 'lb', MT: 'mt', NL: 'nl', PL: 'pl', PT: 'pt-PT', RO: 'ro', SK: 'sk',
  SI: 'sl', ES: 'es', SE: 'sv', IS: 'is', LI: 'de', NO: 'nb', MK: 'mk', RS: 'sr', TR: 'tr', GB: 'en', CH: 'de',
}

const searchNamesCache = new Map<string, readonly string[]>()

function searchNames(country: Country, locale: string): readonly string[] {
  const key = `${locale}|${country.code}`
  let names = searchNamesCache.get(key)
  if (!names) {
    const all = [country.name, getCountryName(country.code, 'en'), getCountryName(country.code, ENDONYM_LOCALE[country.code])]
    names = [...new Set(all.map(foldText))]
    searchNamesCache.set(key, names)
  }
  return names
}

/**
 * Accent/case-insensitive search over the localised name, the English name, the native name and
 * the ISO code ("pol" → Polónia, "osterreich" → Áustria, "de" → Alemanha).
 * Ranking: name prefix, then word prefix, then substring, then exact code; ties keep the collated order.
 * An empty query returns the full list.
 */
export function searchCountries(query: string, locale: string): readonly Country[] {
  const all = getCountries(locale)
  const q = foldText(query.slice(0, 60))
  if (!q) return all
  const ranked: { country: Country; rank: number; index: number }[] = []
  all.forEach((country, index) => {
    const names = searchNames(country, locale)
    let rank = -1
    if (names.some((n) => n.startsWith(q))) rank = 0
    else if (names.some((n) => n.split(/[\s\-'’]+/).some((w) => w.startsWith(q)))) rank = 1
    else if (names.some((n) => n.includes(q))) rank = 2
    else if (q.length === 2 && country.code.toLowerCase() === q) rank = 3
    if (rank >= 0) ranked.push({ country, rank, index })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.country)
}

/**
 * Local language of a country, only when it is unambiguous AND in the language registry.
 * Multilingual countries (BE, CH, LU, FI, …) and languages we do not support return undefined.
 */
const LOCAL_LANGUAGE: Readonly<Partial<Record<string, LanguageCode>>> = {
  PT: 'pt-PT',
  ES: 'es',
  FR: 'fr',
  DE: 'de',
  AT: 'de',
  IT: 'it',
  PL: 'pl',
  IE: 'en',
  GB: 'en',
  MT: 'en',
}

export function localLanguageOf(countryCode: string): LanguageCode | undefined {
  return Object.hasOwn(LOCAL_LANGUAGE, countryCode) ? LOCAL_LANGUAGE[countryCode] : undefined
}
