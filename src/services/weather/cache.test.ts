import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWeatherCache,
  readCachedWeather,
  WEATHER_CACHE_MAX_AGE_MS,
  WEATHER_CACHE_TTL_MS,
  weatherCacheKey,
  writeCachedWeather,
} from './cache'
import { parseOpenMeteoForecast } from './openMeteo'
import { forecastPayload } from './testUtils'
import type { WeatherSnapshot } from './types'

const MILAN = { latitude: 45.4643, longitude: 9.1895 }
const T0 = Date.UTC(2026, 8, 25, 8, 0)

const snapshot = (coords = MILAN, fetchedAt = Date.now()): WeatherSnapshot => parseOpenMeteoForecast(forecastPayload(), coords, fetchedAt)

function storedKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k) keys.push(k)
  }
  return keys
}

/** Simulates a fresh page load: memory is gone, localStorage survives. */
function reloadPage() {
  const saved = storedKeys().map((k) => [k, localStorage.getItem(k) ?? ''] as const)
  clearWeatherCache()
  for (const [k, v] of saved) localStorage.setItem(k, v)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  localStorage.clear()
  clearWeatherCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('weather cache', () => {
  it('uses a 2-decimal coordinate key', () => {
    expect(weatherCacheKey(MILAN)).toBe('eh:weather:45.46,9.19')
    expect(weatherCacheKey({ latitude: -0.001, longitude: 179.999 })).toBe('eh:weather:0.00,180.00')
  })

  it('serves fresh data within the TTL, then flags it stale, then drops it after 24 h', () => {
    writeCachedWeather(snapshot())
    expect(readCachedWeather(MILAN)).toMatchObject({ stale: false, ageMs: 0 })

    vi.advanceTimersByTime(WEATHER_CACHE_TTL_MS)
    expect(readCachedWeather(MILAN)?.stale).toBe(false)

    vi.advanceTimersByTime(1)
    expect(readCachedWeather(MILAN)?.stale).toBe(true)

    vi.advanceTimersByTime(WEATHER_CACHE_MAX_AGE_MS - WEATHER_CACHE_TTL_MS)
    expect(readCachedWeather(MILAN)).toBeNull()
    expect(localStorage.getItem(weatherCacheKey(MILAN))).toBeNull()
  })

  it('persists to localStorage and survives a reload', () => {
    writeCachedWeather(snapshot())
    reloadPage()
    vi.advanceTimersByTime(45 * 60_000)
    const hit = readCachedWeather(MILAN)
    expect(hit?.stale).toBe(true)
    expect(hit?.data.temperature).toBe(18.4)
  })

  it('ignores corrupted or tampered storage', () => {
    const key = weatherCacheKey(MILAN)
    for (const raw of ['{not json', 'null', '[]', '{"v":1}', JSON.stringify({ v: 2, data: snapshot() }), JSON.stringify({ v: 1, data: { ...snapshot(), temperature: 'hot' } }), JSON.stringify({ v: 1, data: { ...snapshot(), feel: 'boiling' } })]) {
      clearWeatherCache()
      localStorage.setItem(key, raw)
      expect(readCachedWeather(MILAN), raw).toBeNull()
    }
    // Snapshot for another place stored under Milan's key.
    clearWeatherCache()
    localStorage.setItem(key, JSON.stringify({ v: 1, data: snapshot({ latitude: 52.23, longitude: 21.01 }) }))
    expect(readCachedWeather(MILAN)).toBeNull()
  })

  it('rejects timestamps from the future', () => {
    writeCachedWeather(snapshot(MILAN, T0 + 60 * 60_000))
    expect(readCachedWeather(MILAN)).toBeNull()
  })

  it('keeps working in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => writeCachedWeather(snapshot())).not.toThrow()
    expect(readCachedWeather(MILAN)?.data.temperature).toBe(18.4)
  })

  it('prunes to the 5 newest entries', () => {
    for (let i = 0; i < 7; i++) {
      vi.advanceTimersByTime(1000)
      writeCachedWeather(snapshot({ latitude: 40 + i, longitude: 10 }))
    }
    const keys = storedKeys().filter((k) => k.startsWith('eh:weather:'))
    expect(keys).toHaveLength(5)
    expect(keys).not.toContain('eh:weather:40.00,10.00')
    expect(keys).toContain('eh:weather:46.00,10.00')
  })

  it('clearWeatherCache removes only weather entries', () => {
    localStorage.setItem('eh:profile', '{}')
    writeCachedWeather(snapshot())
    clearWeatherCache()
    expect(readCachedWeather(MILAN)).toBeNull()
    expect(localStorage.getItem('eh:profile')).toBe('{}')
  })
})
