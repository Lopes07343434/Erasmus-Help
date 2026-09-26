import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import { buildForecastUrl, openMeteoProvider, parseOpenMeteoForecast } from './openMeteo'
import { forecastPayload, jsonResponse, mockFetch } from './testUtils'
import { isWeatherSnapshot } from './types'

const MILAN = { latitude: 45.4643, longitude: 9.1895 }
const NOW = 1_790_000_000_000

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'not-app-error'
  }
  return undefined
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buildForecastUrl', () => {
  it('requests exactly the needed fields with rounded coordinates', () => {
    const url = new URL(buildForecastUrl(MILAN))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('45.46')
    expect(url.searchParams.get('longitude')).toBe('9.19')
    expect(url.searchParams.get('current')).toBe('temperature_2m,apparent_temperature,weather_code,is_day')
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min,precipitation_probability_max')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('forecast_days')).toBe('1')
  })
})

describe('parseOpenMeteoForecast', () => {
  it('maps a valid payload and keeps raw numbers', () => {
    const s = parseOpenMeteoForecast(forecastPayload(), MILAN, NOW)
    expect(s).toEqual({
      provider: 'open-meteo',
      latitude: 45.46,
      longitude: 9.19,
      timezone: 'Europe/Rome',
      fetchedAt: NOW,
      temperature: 18.4,
      apparentTemperature: 17.2,
      min: 12.1,
      max: 22.6,
      precipitationProbability: 35,
      weatherCode: 2,
      condition: 'partlyCloudy',
      isDay: true,
      feel: 'comfortable',
    })
    expect(isWeatherSnapshot(s)).toBe(true)
  })

  it('handles night and missing optional values', () => {
    const s = parseOpenMeteoForecast(
      forecastPayload({
        current: { is_day: 0, apparent_temperature: null, weather_code: 42 },
        daily: { temperature_2m_max: [], temperature_2m_min: [null], precipitation_probability_max: null },
      }),
      MILAN,
      NOW,
    )
    expect(s.isDay).toBe(false)
    expect(s.apparentTemperature).toBeNull()
    expect(s.weatherCode).toBe(42)
    expect(s.condition).toBeNull()
    expect(s.min).toBeNull()
    expect(s.max).toBeNull()
    expect(s.precipitationProbability).toBeNull()
    expect(s.feel).toBe('comfortable') // from air temperature 18.4
  })

  it('works without a daily block or timezone', () => {
    const payload = { current: { temperature_2m: -3.2, apparent_temperature: -8, weather_code: 73, is_day: 1 } }
    const s = parseOpenMeteoForecast(payload, MILAN, NOW)
    expect(s).toMatchObject({ temperature: -3.2, condition: 'snow', feel: 'cold', min: null, max: null, precipitationProbability: null, timezone: null })
  })

  it('drops invalid optional values instead of trusting them', () => {
    const s = parseOpenMeteoForecast(
      forecastPayload({
        current: { apparent_temperature: '17', weather_code: 2.5 },
        daily: { temperature_2m_max: [999], temperature_2m_min: ['12'], precipitation_probability_max: [140] },
      }),
      MILAN,
      NOW,
    )
    expect(s.apparentTemperature).toBeNull()
    expect(s.weatherCode).toBeNull()
    expect(s.max).toBeNull()
    expect(s.min).toBeNull()
    expect(s.precipitationProbability).toBeNull()
  })

  it('rejects a bogus timezone string', () => {
    const payload = { ...forecastPayload(), timezone: '<script>alert(1)</script>' }
    expect(parseOpenMeteoForecast(payload, MILAN, NOW).timezone).toBeNull()
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'oops'],
    ['error payload', { error: true, reason: 'Parameter is invalid' }],
    ['no current', { daily: {} }],
    ['current not an object', { current: [1, 2] }],
    ['missing temperature', forecastPayload({ current: { temperature_2m: undefined } })],
    ['string temperature', forecastPayload({ current: { temperature_2m: '18' } })],
    ['NaN temperature', forecastPayload({ current: { temperature_2m: Number.NaN } })],
    ['Infinity temperature', forecastPayload({ current: { temperature_2m: Number.POSITIVE_INFINITY } })],
    ['implausible temperature', forecastPayload({ current: { temperature_2m: 150 } })],
  ])('throws AppError(unavailable) for %s', (_label, payload) => {
    expect(codeOf(() => parseOpenMeteoForecast(payload, MILAN, NOW))).toBe('unavailable')
  })
})

describe('openMeteoProvider.getCurrent', () => {
  it('fetches and parses', async () => {
    const fetchMock = mockFetch(jsonResponse(forecastPayload()))
    const s = await openMeteoProvider.getCurrent(MILAN)
    expect(s.temperature).toBe(18.4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.open-meteo.com/v1/forecast?latitude=45.46')
  })

  it('rejects invalid coordinates without a request', async () => {
    const fetchMock = mockFetch(jsonResponse(forecastPayload()))
    await expect(openMeteoProvider.getCurrent({ latitude: 91, longitude: 0 })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(openMeteoProvider.getCurrent({ latitude: Number.NaN, longitude: 0 })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps HTTP and network failures to AppError codes', async () => {
    mockFetch(jsonResponse({}, 503))
    await expect(openMeteoProvider.getCurrent(MILAN)).rejects.toMatchObject({ code: 'unavailable' })
    mockFetch(jsonResponse({}, 429))
    await expect(openMeteoProvider.getCurrent(MILAN)).rejects.toMatchObject({ code: 'rate-limited' })
    mockFetch(new TypeError('Failed to fetch'))
    await expect(openMeteoProvider.getCurrent(MILAN)).rejects.toMatchObject({ code: 'unavailable' })
    mockFetch(jsonResponse(null))
    await expect(openMeteoProvider.getCurrent(MILAN)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('fails fast when offline', async () => {
    const fetchMock = mockFetch(jsonResponse(forecastPayload()))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(openMeteoProvider.getCurrent(MILAN)).rejects.toMatchObject({ code: 'offline' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
