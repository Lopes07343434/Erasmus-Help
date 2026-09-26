import { AppError } from '@/services/errors'
import { isRecord, requestJson } from '@/services/http'
import { isCountryCode } from '@/utils/validation'
import { CITY_QUERY_MIN_LENGTH, foldText, sanitizeCityQuery } from './text'
import type { CityResult, CitySearchOptions, GeocodingProvider } from './types'

/** Open-Meteo Geocoding API (GeoNames data, CC BY 4.0, no key). */
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

const DEFAULT_COUNT = 10
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/

/** 'pt-PT' → 'pt', 'EN' → 'en'; anything unexpected → 'en'. */
export function toApiLanguage(locale: string | undefined): string {
  const base = (locale ?? '').split('-')[0]?.toLowerCase() ?? ''
  return /^[a-z]{2}$/.test(base) ? base : 'en'
}

export function buildGeocodingUrl(countryCode: string, query: string, language: string, count: number = DEFAULT_COUNT): string {
  const params = new URLSearchParams({
    name: query,
    count: String(Math.min(20, Math.max(1, Math.trunc(count)))),
    language: toApiLanguage(language),
    format: 'json',
    countryCode,
  })
  return `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`
}

const cleanString = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
  return s && s.length <= max ? s : undefined
}

function parseResult(raw: unknown, countryCode: string): CityResult | null {
  if (!isRecord(raw)) return null
  if (raw.country_code !== countryCode) return null
  // Only populated places (PPL, PPLA, PPLC…): no countries, regions, airports, etc.
  if (typeof raw.feature_code === 'string' && !raw.feature_code.startsWith('PPL')) return null
  const name = cleanString(raw.name, 80)
  const { latitude, longitude } = raw
  if (!name) return null
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null

  const result: CityResult = {
    id: typeof raw.id === 'number' && Number.isSafeInteger(raw.id) ? String(raw.id) : `${latitude},${longitude}`,
    name,
    countryCode,
    latitude,
    longitude,
  }
  const admin1 = cleanString(raw.admin1, 80)
  if (admin1 && admin1 !== name) result.admin1 = admin1
  if (typeof raw.timezone === 'string' && TIMEZONE_PATTERN.test(raw.timezone)) result.timezone = raw.timezone
  if (typeof raw.population === 'number' && Number.isSafeInteger(raw.population) && raw.population >= 0) result.population = raw.population
  return result
}

/**
 * Validates a geocoding payload (treated as `unknown`), keeps only valid populated places in
 * `countryCode`, sorts by population (desc; unknown last; ties keep API relevance order) and
 * dedupes by id and by name + region (keeping the most populated).
 */
export function parseGeocodingResponse(payload: unknown, countryCode: string): CityResult[] {
  if (!isRecord(payload)) throw new AppError('unavailable')
  if (payload.error === true) throw new AppError('unavailable')
  // No match → Open-Meteo omits `results`.
  if (payload.results === undefined) return []
  if (!Array.isArray(payload.results)) throw new AppError('unavailable')

  const parsed = payload.results.map((r: unknown) => parseResult(r, countryCode)).filter((r): r is CityResult => r !== null)
  const sorted = parsed
    .map((r, index) => ({ r, index }))
    .sort((a, b) => (b.r.population ?? -1) - (a.r.population ?? -1) || a.index - b.index)
    .map(({ r }) => r)

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return sorted.filter((r) => {
    const nameKey = `${foldText(r.name)}|${foldText(r.admin1 ?? '')}`
    if (seenIds.has(r.id) || seenNames.has(nameKey)) return false
    seenIds.add(r.id)
    seenNames.add(nameKey)
    return true
  })
}

/** Small in-memory LRU so typing / backspacing does not repeat identical requests. */
const MEMO_LIMIT = 50
const memo = new Map<string, CityResult[]>()

function remember(key: string, value: CityResult[]): void {
  memo.delete(key)
  memo.set(key, value)
  if (memo.size > MEMO_LIMIT) {
    const oldest = memo.keys().next().value
    if (oldest !== undefined) memo.delete(oldest)
  }
}

/** Test helper / "delete device data". */
export function clearGeocodingMemo(): void {
  memo.clear()
}

export const openMeteoGeocoding: GeocodingProvider = {
  id: 'open-meteo',
  async searchCities(countryCode: string, rawQuery: string, opts: CitySearchOptions = {}): Promise<CityResult[]> {
    if (!isCountryCode(countryCode)) throw new AppError('invalid-input')
    const query = sanitizeCityQuery(rawQuery)
    if (query.length < CITY_QUERY_MIN_LENGTH) return []
    const language = toApiLanguage(opts.language)
    const count = opts.count ?? DEFAULT_COUNT
    const key = `${countryCode}|${language}|${count}|${foldText(query)}`
    const hit = memo.get(key)
    if (hit) return hit

    const payload = await requestJson(buildGeocodingUrl(countryCode, query, language, count), { signal: opts.signal, timeoutMs: 8_000 })
    const results = parseGeocodingResponse(payload, countryCode)
    remember(key, results)
    return results
  },
}
