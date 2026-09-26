import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGeocodingMemo } from '@/services/geo'
import { clearWeatherCache, readCachedWeather } from '@/services/weather'
import { parseOpenMeteoForecast } from '@/services/weather/openMeteo'
import { forecastPayload, jsonResponse } from '@/services/weather/testUtils'
import { writeCachedWeather } from '@/services/weather/cache'
import { useProfileStore } from '@/stores/profileStore'
import type { UserLocation } from '@/types/profile'
import { useWeather } from './useWeather'

const MILAN: UserLocation = { countryCode: 'IT', city: { name: 'Milano', latitude: 45.4643, longitude: 9.1895 } }
const MILAN_BY_NAME: UserLocation = { countryCode: 'IT', city: { name: 'Milano' } }
const geocodingPayload = { results: [{ id: 1, name: 'Milano', latitude: 45.4643, longitude: 9.1895, country_code: 'IT', feature_code: 'PPLA', admin1: 'Lombardia', timezone: 'Europe/Rome', population: 1_000_000 }] }

type Route = (url: string) => Response | Error
function routeFetch(route: Route) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
    const res = route(String(url))
    return res instanceof Error ? Promise.reject(res) : Promise.resolve(res)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const okRoute: Route = (url) => (url.includes('geocoding-api') ? jsonResponse(geocodingPayload) : jsonResponse(forecastPayload()))

const seedCache = (ageMs: number) => writeCachedWeather(parseOpenMeteoForecast(forecastPayload({ current: { temperature_2m: 11 } }), MILAN.city as { latitude: number; longitude: number }, Date.now() - ageMs))

beforeEach(() => {
  localStorage.clear()
  clearWeatherCache()
  clearGeocodingMemo()
  useProfileStore.getState().reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useWeather', () => {
  it('is empty without a location and never fetches', () => {
    const fetchMock = routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(null))
    expect(result.current.status).toBe('empty')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads, succeeds and does not refetch on re-render', async () => {
    const fetchMock = routeFetch(okRoute)
    const { result, rerender } = renderHook(({ loc }) => useWeather(loc), { initialProps: { loc: MILAN } })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toMatchObject({ temperature: 18.4, condition: 'partlyCloudy', feel: 'comfortable', stale: false })
    rerender({ loc: { ...MILAN, city: { ...MILAN.city } } }) // new object, same location
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves a fresh cache on the first render without fetching', () => {
    seedCache(5 * 60_000)
    const fetchMock = routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(MILAN))
    expect(result.current.status).toBe('success')
    expect(result.current.data).toMatchObject({ temperature: 11, stale: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows stale cache immediately and revalidates in the background', async () => {
    seedCache(45 * 60_000)
    routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(MILAN))
    expect(result.current.status).toBe('success')
    expect(result.current.data).toMatchObject({ temperature: 11, stale: true })
    expect(result.current.isRefreshing).toBe(true)
    await waitFor(() => expect(result.current.data?.stale).toBe(false))
    expect(result.current.data?.temperature).toBe(18.4)
  })

  it('is offline with stale cached data, and refreshes when back online', async () => {
    seedCache(2 * 60 * 60_000)
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetchMock = routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(MILAN))
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(result.current.data).toMatchObject({ temperature: 11, stale: true })
    expect(result.current.error?.code).toBe('offline')
    expect(fetchMock).not.toHaveBeenCalled()

    onLine.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(result.current.data?.stale).toBe(false))
    expect(result.current.status).toBe('success')
    expect(result.current.data?.temperature).toBe(18.4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is offline without data when there is no cache', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(MILAN))
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(result.current.data).toBeUndefined()
  })

  it('reports API errors, keeping stale data as fallback', async () => {
    seedCache(60 * 60_000)
    routeFetch(() => jsonResponse({}, 503))
    const { result } = renderHook(() => useWeather(MILAN))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('unavailable')
    expect(result.current.data).toMatchObject({ temperature: 11, stale: true })
    expect(result.current.isRefreshing).toBe(false)
  })

  it('reports errors without data when the cache is empty (no retry loop)', async () => {
    const fetchMock = routeFetch(() => new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useWeather(MILAN))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeUndefined()
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refresh() forces a network request even with a fresh cache', async () => {
    seedCache(60_000)
    const fetchMock = routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(MILAN))
    expect(result.current.data?.temperature).toBe(11)
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.data?.temperature).toBe(18.4))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('geocodes a location saved without coordinates once and stores them in the profile', async () => {
    useProfileStore.getState().setLocation(MILAN_BY_NAME)
    const fetchMock = routeFetch(okRoute)
    const { result } = renderHook(() => useWeather(useProfileStore((s) => s.location)))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(useProfileStore.getState().location?.city).toMatchObject({ name: 'Milano', latitude: 45.4643, longitude: 9.1895, timezone: 'Europe/Rome', admin1: 'Lombardia' })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.filter((u) => u.includes('geocoding-api'))).toHaveLength(1)
    expect(urls.filter((u) => u.includes('/v1/forecast'))).toHaveLength(1)
    expect(readCachedWeather(MILAN.city as { latitude: number; longitude: number })).not.toBeNull()
  })

  it('reports not-found when the saved city cannot be geocoded', async () => {
    routeFetch(() => jsonResponse({}))
    const { result } = renderHook(() => useWeather({ countryCode: 'IT', city: { name: 'Atlantis' } }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('not-found')
  })

  it('aborts the request on unmount', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      }),
    )
    const { unmount } = renderHook(() => useWeather(MILAN))
    await waitFor(() => expect(signal).toBeDefined())
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('never shows data from the previous location', async () => {
    routeFetch(okRoute)
    const { result, rerender } = renderHook(({ loc }) => useWeather(loc), { initialProps: { loc: MILAN } })
    await waitFor(() => expect(result.current.status).toBe('success'))
    rerender({ loc: { countryCode: 'PL', city: { name: 'Warszawa', latitude: 52.23, longitude: 21.01 } } })
    expect(result.current.status).toBe('loading')
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data?.latitude).toBe(52.23))
  })
})
