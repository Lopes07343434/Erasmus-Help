import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toAppError, type AppError } from '@/services/errors'
import { resolveCity } from '@/services/geo'
import { fetchWeather, readCachedWeather, WEATHER_CACHE_TTL_MS, type WeatherSnapshot } from '@/services/weather'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { UserLocation } from '@/types/profile'

export type WeatherStatus = 'empty' | 'loading' | 'success' | 'error' | 'offline'
export type WeatherData = WeatherSnapshot & { stale: boolean }

export interface UseWeatherResult {
  /**
   * - empty:   no location → show "Sem localização definida" + action;
   * - loading: first load, no data yet;
   * - success: `data` present (may be `stale` while it revalidates in the background — see `isRefreshing`);
   * - offline: no network; `data` is the cached reading when there is one;
   * - error:   API unavailable / timeout / city not found / not configured (`error.code`);
   *            `data` is the cached reading when there is one.
   */
  status: WeatherStatus
  data?: WeatherData
  error?: AppError
  /** A network request is in flight (first load or background revalidation). */
  isRefreshing: boolean
  /** Forces a network request (ignores a fresh cache). */
  refresh: () => void
}

/** Outcome of the last finished request. */
interface Settled {
  /** Location + coordinates it belongs to, so data never leaks across locations. */
  key: string
  /** Trigger generation it answers; a newer trigger means a request is in flight. */
  n: number
  status: 'success' | 'error' | 'offline'
  data?: WeatherData
  error?: AppError
}

interface Resolved {
  key: string
  latitude: number
  longitude: number
}

interface Trigger {
  n: number
  /** Bypass a fresh cache (user-initiated refresh). */
  force: boolean
}

/**
 * Weather for the user's location, with cache (30 min fresh, stale-while-revalidate, offline fallback).
 * Locations saved without coordinates are geocoded once and the coordinates stored back in the profile.
 * Requests are aborted on unmount / location change. Revalidates on reconnect and when the tab becomes
 * visible again with expired data. Weather always comes from the weather API, never from AI.
 */
export function useWeather(location: UserLocation | null): UseWeatherResult {
  const countryCode = location?.countryCode ?? null
  const cityName = location?.city.name ?? null
  const locKey = countryCode && cityName ? `${countryCode}|${cityName}` : null

  const [resolved, setResolved] = useState<Resolved | null>(null)
  const savedLat = location?.city.latitude
  const savedLon = location?.city.longitude
  const hasSaved = savedLat !== undefined && savedLon !== undefined
  const lat = hasSaved ? savedLat : resolved && resolved.key === locKey ? resolved.latitude : null
  const lon = hasSaved ? savedLon : resolved && resolved.key === locKey ? resolved.longitude : null
  const stateKey = `${locKey ?? ''}@${lat ?? '?'},${lon ?? '?'}`

  const [settled, setSettled] = useState<Settled | null>(null)
  const [trigger, setTrigger] = useState<Trigger>({ n: 0, force: false })

  const refresh = useCallback(() => setTrigger((t) => ({ n: t.n + 1, force: true })), [])

  // Synchronous cache read (re-read on every trigger): a cached reading renders on the first frame,
  // and a fresh one needs no request unless the user forced a refresh.
  const { peek, servedFromCache } = useMemo(() => {
    const hit = lat !== null && lon !== null ? readCachedWeather({ latitude: lat, longitude: lon }) : null
    return { peek: hit, servedFromCache: hit !== null && !hit.stale && !trigger.force }
  }, [lat, lon, trigger])

  useEffect(() => {
    if (!locKey || !countryCode || !cityName) return
    const controller = new AbortController()
    const { signal } = controller
    const settle = (s: Omit<Settled, 'key' | 'n'>) => {
      if (!signal.aborted) setSettled({ key: stateKey, n: trigger.n, ...s })
    }
    const fail = (err: unknown, fallback?: WeatherData) => {
      const error = toAppError(err)
      if (signal.aborted || error.code === 'aborted') return
      settle({ status: error.code === 'offline' ? 'offline' : 'error', data: fallback, error })
    }

    if (lat === null || lon === null) {
      // Saved by name only: geocode once, then persist the coordinates so this never repeats.
      const language = useSettingsStore.getState().appLanguage
      resolveCity(countryCode, cityName, { signal, language }).then((city) => {
        if (signal.aborted) return
        setResolved({ key: locKey, latitude: city.latitude, longitude: city.longitude })
        const { location: current, setLocation } = useProfileStore.getState()
        if (current && current.countryCode === countryCode && current.city.name === cityName && (current.city.latitude === undefined || current.city.longitude === undefined)) {
          setLocation({
            countryCode,
            city: {
              ...current.city,
              latitude: city.latitude,
              longitude: city.longitude,
              timezone: current.city.timezone ?? city.timezone,
              admin1: current.city.admin1 ?? city.admin1,
            },
          })
        }
      }, fail)
      return () => controller.abort()
    }

    if (servedFromCache) return
    const fallback: WeatherData | undefined = peek ? { ...peek.data, stale: peek.stale } : undefined
    fetchWeather({ latitude: lat, longitude: lon }, { signal }).then(
      (snapshot) => settle({ status: 'success', data: { ...snapshot, stale: false } }),
      (err: unknown) => fail(err, fallback),
    )
    return () => controller.abort()
  }, [locKey, countryCode, cityName, lat, lon, stateKey, trigger, peek, servedFromCache])

  const result = useMemo<UseWeatherResult>(() => {
    if (!locKey) return { status: 'empty', isRefreshing: false, refresh }
    const current = settled && settled.key === stateKey ? settled : null
    if (current && current.n === trigger.n) {
      return { status: current.status, data: current.data, error: current.error, isRefreshing: false, refresh }
    }
    if (servedFromCache && peek) return { status: 'success', data: { ...peek.data, stale: false }, isRefreshing: false, refresh }
    // A request (geocoding or weather) is in flight: keep showing what we have.
    const data = peek ? { ...peek.data, stale: peek.stale } : current?.data
    return { status: data ? 'success' : 'loading', data, isRefreshing: true, refresh }
  }, [locKey, settled, stateKey, trigger, servedFromCache, peek, refresh])

  // Revalidate when the connection comes back, or when the app is reopened with expired data.
  const resultRef = useRef(result)
  useEffect(() => {
    resultRef.current = result
  })
  useEffect(() => {
    if (!locKey) return
    const isExpired = (r: UseWeatherResult) => !!r.data && Date.now() - r.data.fetchedAt > WEATHER_CACHE_TTL_MS
    const revalidate = () => setTrigger((t) => ({ n: t.n + 1, force: false }))
    const onOnline = () => {
      const r = resultRef.current
      if (!r.isRefreshing && (r.status === 'offline' || r.status === 'error' || isExpired(r))) revalidate()
    }
    const onVisibility = () => {
      const r = resultRef.current
      if (document.visibilityState === 'visible' && !r.isRefreshing && r.status === 'success' && isExpired(r)) revalidate()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [locKey])

  return result
}
