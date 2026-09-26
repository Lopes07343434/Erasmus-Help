import { AppError } from '@/services/errors'
import { openMeteoGeocoding } from './openMeteoGeocoding'
import { foldText, sanitizeCityQuery } from './text'
import type { CityResult, CitySearchOptions, GeocodingProvider } from './types'

/**
 * Geo service entry point (city search + country list). Import from here only;
 * the geocoding provider can be swapped by changing getGeocodingProvider().
 */
export function getGeocodingProvider(): GeocodingProvider {
  return openMeteoGeocoding
}

/** Cities in a country matching `query` (≥ 2 chars after sanitising), sorted by population. Throws AppError. */
export function searchCities(countryCode: string, query: string, opts?: CitySearchOptions): Promise<CityResult[]> {
  return getGeocodingProvider().searchCities(countryCode, query, opts)
}

/**
 * Finds coordinates for a location saved by name only (e.g. typed while offline).
 * Prefers an exact (accent-insensitive) name match, then the most populated result.
 * Throws AppError('not-found') when nothing in that country matches.
 */
export async function resolveCity(countryCode: string, cityName: string, opts?: CitySearchOptions): Promise<CityResult> {
  const name = sanitizeCityQuery(cityName)
  if (!name) throw new AppError('invalid-input')
  const results = await searchCities(countryCode, name, opts)
  const wanted = foldText(name)
  const best = results.find((r) => foldText(r.name) === wanted) ?? results[0]
  if (!best) throw new AppError('not-found')
  return best
}

export { clearGeocodingMemo } from './openMeteoGeocoding'
export { CITY_QUERY_MIN_LENGTH, CITY_QUERY_MAX_LENGTH, sanitizeCityQuery, foldText } from './text'
export {
  COUNTRY_CODES,
  countryFlag,
  getCountries,
  getCountryName,
  isSupportedCountry,
  localLanguageOf,
  searchCountries,
  type Country,
  type SupportedCountryCode,
} from './countries'
export type { CityResult, CitySearchOptions, GeocodingProvider } from './types'
