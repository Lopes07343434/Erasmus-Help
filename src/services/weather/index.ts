import { env } from '@/config/env'
import { AppError } from '@/services/errors'
import { writeCachedWeather } from './cache'
import { openMeteoProvider } from './openMeteo'
import type { Coordinates, WeatherProvider, WeatherRequestOptions, WeatherSnapshot } from './types'

/**
 * Weather service entry point. The rest of the app imports from here only, so the provider
 * can be swapped by adding an implementation of WeatherProvider and a case below.
 */
export function getWeatherProvider(): WeatherProvider {
  switch (env.weatherProvider) {
    case 'open-meteo':
      return openMeteoProvider
    case 'none':
      throw new AppError('not-configured')
  }
}

/** Fetches current weather from the configured provider and stores it in the cache. Throws AppError. */
export async function fetchWeather(coords: Coordinates, opts: WeatherRequestOptions = {}): Promise<WeatherSnapshot> {
  const snapshot = await getWeatherProvider().getCurrent(coords, opts)
  writeCachedWeather(snapshot)
  return snapshot
}

export { readCachedWeather, clearWeatherCache, WEATHER_CACHE_TTL_MS, WEATHER_CACHE_MAX_AGE_MS, type CachedWeather } from './cache'
export { roundTemperature, roundPercent, formatDataAge } from './format'
export { feelFromTemperature, FEEL_THRESHOLDS } from './feel'
export { conditionFromWmo } from './wmo'
export {
  WEATHER_CONDITIONS,
  FEELS,
  isValidCoordinates,
  type Coordinates,
  type Feel,
  type WeatherCondition,
  type WeatherProvider,
  type WeatherSnapshot,
} from './types'
