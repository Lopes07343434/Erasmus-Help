/** Shared fixtures for weather/geo tests (not imported by app code). */
import { vi } from 'vitest'

export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

/** Replaces global fetch with a mock returning the given responses in order (last one repeats). */
export function mockFetch(...responses: (Response | Error)[]) {
  let i = 0
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    const next = responses[Math.min(i++, responses.length - 1)]
    if (init?.signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next ?? jsonResponse({}))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export const forecastPayload = (overrides: { current?: Record<string, unknown>; daily?: Record<string, unknown> } = {}) => ({
  latitude: 45.46,
  longitude: 9.18,
  utc_offset_seconds: 7200,
  timezone: 'Europe/Rome',
  current: { time: '2026-09-25T10:15', interval: 900, temperature_2m: 18.4, apparent_temperature: 17.2, weather_code: 2, is_day: 1, ...overrides.current },
  daily: {
    time: ['2026-09-25'],
    temperature_2m_max: [22.6],
    temperature_2m_min: [12.1],
    precipitation_probability_max: [35],
    ...overrides.daily,
  },
})
