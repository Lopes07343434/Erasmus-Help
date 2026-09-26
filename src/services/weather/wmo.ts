import type { WeatherCondition } from './types'

/**
 * WMO weather interpretation codes (WW) as used by Open-Meteo, grouped into the app's conditions.
 * https://open-meteo.com/en/docs → "WMO Weather interpretation codes".
 * Freezing drizzle (56/57) is shown as freezing rain; thunderstorm with hail (96/99) as thunderstorm.
 */
export const WMO_CODES: Readonly<Record<number, WeatherCondition>> = {
  0: 'clear',
  1: 'mainlyClear',
  2: 'partlyCloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezingRain',
  57: 'freezingRain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'freezingRain',
  67: 'freezingRain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rainShowers',
  81: 'rainShowers',
  82: 'rainShowers',
  85: 'snowShowers',
  86: 'snowShowers',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'thunderstorm',
}

/** Maps a WMO code to a condition; `null` for anything that is not a documented integer code. */
export function conditionFromWmo(code: unknown): WeatherCondition | null {
  if (typeof code !== 'number' || !Number.isInteger(code)) return null
  return Object.hasOwn(WMO_CODES, code) ? (WMO_CODES[code] ?? null) : null
}
