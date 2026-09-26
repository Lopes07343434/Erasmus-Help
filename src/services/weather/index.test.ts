import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { clearWeatherCache, fetchWeather, getWeatherProvider, readCachedWeather } from './index'
import { forecastPayload, jsonResponse, mockFetch } from './testUtils'

vi.mock('@/config/env', () => ({ env: { weatherProvider: 'open-meteo' } }))

const MILAN = { latitude: 45.4643, longitude: 9.1895 }

beforeEach(() => {
  localStorage.clear()
  clearWeatherCache()
})

afterEach(() => {
  ;(env as { weatherProvider: string }).weatherProvider = 'open-meteo'
  vi.unstubAllGlobals()
})

describe('weather service', () => {
  it('selects Open-Meteo from env', () => {
    expect(getWeatherProvider().id).toBe('open-meteo')
  })

  it("throws AppError('not-configured') when the provider is 'none'", async () => {
    ;(env as { weatherProvider: string }).weatherProvider = 'none'
    expect(() => getWeatherProvider()).toThrow(expect.objectContaining({ code: 'not-configured' }))
    await expect(fetchWeather(MILAN)).rejects.toMatchObject({ code: 'not-configured' })
  })

  it('fetchWeather stores the snapshot in the cache', async () => {
    mockFetch(jsonResponse(forecastPayload()))
    const s = await fetchWeather(MILAN)
    expect(readCachedWeather(MILAN)?.data).toEqual(s)
  })

  it('does not cache failures', async () => {
    mockFetch(jsonResponse({}, 500))
    await expect(fetchWeather(MILAN)).rejects.toMatchObject({ code: 'unavailable' })
    expect(readCachedWeather(MILAN)).toBeNull()
  })
})
