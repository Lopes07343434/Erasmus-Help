import { AppError } from '@/services/errors'
import { isRecord, requestJson } from '@/services/http'
import { computeFeel } from './feel'
import type { Coordinates, WeatherProvider, WeatherRequestOptions, WeatherSnapshot } from './types'
import { isValidCoordinates, roundCoord } from './types'
import { conditionFromWmo } from './wmo'

/**
 * Open-Meteo forecast API (free, no key). Data licence CC BY 4.0 → the UI must show
 * attribution (i18n `weather.attribution`).
 */
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

/** Plausible surface air temperatures (°C). Anything outside is treated as invalid data. */
const MIN_TEMP = -90
const MAX_TEMP = 60

export function buildForecastUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: roundCoord(latitude).toFixed(2),
    longitude: roundCoord(longitude).toFixed(2),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  })
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`
}

const temp = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= MIN_TEMP && v <= MAX_TEMP ? v : null)

const firstOf = (daily: Record<string, unknown>, key: string): unknown => {
  const arr = daily[key]
  return Array.isArray(arr) ? (arr[0] as unknown) : undefined
}

const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/

/**
 * Validates an Open-Meteo forecast payload (treated as `unknown`) and maps it to a WeatherSnapshot.
 * Throws AppError('unavailable') when the essential value (current temperature) is missing or invalid.
 * Optional values (apparent temp, min/max, rain probability, condition) degrade to `null`.
 */
export function parseOpenMeteoForecast(payload: unknown, coords: Coordinates, fetchedAt: number = Date.now()): WeatherSnapshot {
  if (!isRecord(payload) || payload.error === true) throw new AppError('unavailable')
  const current = payload.current
  if (!isRecord(current)) throw new AppError('unavailable')

  const temperature = temp(current.temperature_2m)
  if (temperature === null) throw new AppError('unavailable')

  const apparentTemperature = temp(current.apparent_temperature)
  const code = current.weather_code
  const weatherCode = typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 99 ? code : null
  const isDay = current.is_day === 0 || current.is_day === false ? false : true

  const daily = isRecord(payload.daily) ? payload.daily : {}
  let min = temp(firstOf(daily, 'temperature_2m_min'))
  let max = temp(firstOf(daily, 'temperature_2m_max'))
  if (min !== null && max !== null && min > max) [min, max] = [max, min]
  const rawProb = firstOf(daily, 'precipitation_probability_max')
  const precipitationProbability = typeof rawProb === 'number' && Number.isFinite(rawProb) && rawProb >= 0 && rawProb <= 100 ? rawProb : null

  const tz = payload.timezone
  const timezone = typeof tz === 'string' && TIMEZONE_PATTERN.test(tz) ? tz : null

  return {
    provider: 'open-meteo',
    latitude: roundCoord(coords.latitude),
    longitude: roundCoord(coords.longitude),
    timezone,
    fetchedAt,
    temperature,
    apparentTemperature,
    min,
    max,
    precipitationProbability,
    weatherCode,
    condition: conditionFromWmo(weatherCode),
    isDay,
    feel: computeFeel(temperature, apparentTemperature),
  }
}

export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  async getCurrent(coords: Coordinates, opts: WeatherRequestOptions = {}): Promise<WeatherSnapshot> {
    if (!isValidCoordinates(coords)) throw new AppError('invalid-input')
    const payload = await requestJson(buildForecastUrl(coords), { signal: opts.signal, timeoutMs: 10_000 })
    return parseOpenMeteoForecast(payload, coords)
  },
}
