/**
 * Provider-agnostic weather model. Everything outside services/weather talks in these types,
 * so the provider (Open-Meteo today) can be replaced without touching the rest of the app.
 * Weather data always comes from a weather API — it is never AI-generated.
 */

/** Simplified condition, derived from the WMO weather interpretation code. Keys match i18n `weather.conditions.*`. */
export type WeatherCondition =
  | 'clear'
  | 'mainlyClear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezingRain'
  | 'snow'
  | 'rainShowers'
  | 'snowShowers'
  | 'thunderstorm'

export const WEATHER_CONDITIONS: readonly WeatherCondition[] = [
  'clear',
  'mainlyClear',
  'partlyCloudy',
  'overcast',
  'fog',
  'drizzle',
  'rain',
  'freezingRain',
  'snow',
  'rainShowers',
  'snowShowers',
  'thunderstorm',
]

/** Simple thermal feel label. Keys match i18n `weather.feel.*`. See feel.ts for thresholds. */
export type Feel = 'cold' | 'cool' | 'comfortable' | 'hot'

export const FEELS: readonly Feel[] = ['cold', 'cool', 'comfortable', 'hot']

export interface Coordinates {
  latitude: number
  longitude: number
}

/**
 * One reading of "weather now + today" for a location. Temperatures are raw °C numbers
 * (round only for display, see format.ts). Optional fields are `null` when the provider
 * did not return a usable value — the UI simply hides them.
 */
export interface WeatherSnapshot {
  /** Provider id, e.g. 'open-meteo' (used for attribution). */
  provider: string
  latitude: number
  longitude: number
  /** IANA timezone of the location, when the provider reports it. */
  timezone: string | null
  /** Epoch ms at which the app received the data. */
  fetchedAt: number
  /** Current air temperature (°C). Always present. */
  temperature: number
  /** Current apparent ("feels like") temperature (°C). */
  apparentTemperature: number | null
  /** Today's minimum / maximum (°C). */
  min: number | null
  max: number | null
  /** Today's maximum probability of precipitation, 0–100 (%). */
  precipitationProbability: number | null
  /** Raw WMO code, kept for debugging / future providers. */
  weatherCode: number | null
  /** `null` when the provider sent a code we do not recognise. */
  condition: WeatherCondition | null
  isDay: boolean
  feel: Feel
}

export interface WeatherRequestOptions {
  signal?: AbortSignal
}

export interface WeatherProvider {
  readonly id: string
  /** Current conditions + today's min/max/rain probability. Throws AppError on failure. */
  getCurrent(coords: Coordinates, opts?: WeatherRequestOptions): Promise<WeatherSnapshot>
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNullableFinite = (v: unknown): v is number | null => v === null || isFiniteNumber(v)

/** Coordinates are requested and cached at 2 decimal places (~1 km): enough for a city forecast. */
export const roundCoord = (n: number): number => Math.round(n * 100) / 100

export function isValidCoordinates(c: unknown): c is Coordinates {
  if (typeof c !== 'object' || c === null) return false
  const { latitude, longitude } = c as Record<string, unknown>
  return isFiniteNumber(latitude) && isFiniteNumber(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

/** Runtime shape check for snapshots coming back from storage (localStorage can be corrupted or tampered with). */
export function isWeatherSnapshot(v: unknown): v is WeatherSnapshot {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.provider === 'string' &&
    s.provider.length > 0 &&
    s.provider.length <= 32 &&
    isValidCoordinates(s) &&
    (s.timezone === null || (typeof s.timezone === 'string' && s.timezone.length <= 64)) &&
    isFiniteNumber(s.fetchedAt) &&
    isFiniteNumber(s.temperature) &&
    isNullableFinite(s.apparentTemperature) &&
    isNullableFinite(s.min) &&
    isNullableFinite(s.max) &&
    isNullableFinite(s.precipitationProbability) &&
    (s.precipitationProbability === null || (s.precipitationProbability >= 0 && s.precipitationProbability <= 100)) &&
    isNullableFinite(s.weatherCode) &&
    (s.condition === null || (WEATHER_CONDITIONS as readonly unknown[]).includes(s.condition)) &&
    typeof s.isDay === 'boolean' &&
    (FEELS as readonly unknown[]).includes(s.feel)
  )
}
