import { sanitizeText } from '@/utils/validation'

/** Letters that do not decompose under NFD but that users commonly type without the diacritic. */
const EXTRA_FOLDS: Readonly<Record<string, string>> = {
  ł: 'l',
  đ: 'd',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
  ð: 'd',
  ı: 'i',
}

/** Accent/case-insensitive comparison key: "Łódź" → "lodz", "Österreich" → "osterreich". */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[łđøæœßþðı]/g, (c) => EXTRA_FOLDS[c] ?? c)
    .trim()
}

export const CITY_QUERY_MIN_LENGTH = 2
export const CITY_QUERY_MAX_LENGTH = 80

/** Trims, collapses whitespace, strips control/invisible characters and caps the length at 80. */
export function sanitizeCityQuery(raw: string): string {
  return sanitizeText(raw, CITY_QUERY_MAX_LENGTH).trim()
}
