/** A populated place returned by geocoding, already validated. */
export interface CityResult {
  /** Stable id for list keys (provider id, or coordinates when the provider has none). */
  id: string
  name: string
  /** First-level administrative area (region / state / voivodeship…). */
  admin1?: string
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string
  latitude: number
  longitude: number
  /** IANA timezone, e.g. "Europe/Rome". */
  timezone?: string
  population?: number
}

export interface CitySearchOptions {
  /** UI locale or 2-letter language for the returned names (e.g. 'pt-PT' → 'pt'). Defaults to 'en'. */
  language?: string
  signal?: AbortSignal
  /** Max results requested from the provider (1–20, default 10). */
  count?: number
}

export interface GeocodingProvider {
  readonly id: string
  /** Cities in `countryCode` matching `query`, validated, deduped and sorted by population (desc). Throws AppError. */
  searchCities(countryCode: string, query: string, opts?: CitySearchOptions): Promise<CityResult[]>
}
