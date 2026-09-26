import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGeocodingMemo } from '@/services/geo'
import { jsonResponse } from '@/services/weather/testUtils'
import { useCitySearch } from './useCitySearch'

const results = (names: string[]) => ({
  results: names.map((name, i) => ({ id: i + 1, name, latitude: 38.7 + i, longitude: -9.1, country_code: 'PT', feature_code: 'PPL', population: 1000 - i })),
})

let signals: AbortSignal[] = []
function stubFetch(body: (url: string) => unknown, status = 200) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal)
    return Promise.resolve(jsonResponse(body(String(url)), status))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const flush = () => act(async () => {
  await vi.advanceTimersByTimeAsync(300)
})

beforeEach(() => {
  vi.useFakeTimers()
  signals = []
  clearGeocodingMemo()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useCitySearch', () => {
  it('is idle without a country or with fewer than 2 characters', async () => {
    const fetchMock = stubFetch(() => results(['Lisboa']))
    const { result, rerender } = renderHook(({ cc, q }) => useCitySearch(cc, q, 'pt-PT'), { initialProps: { cc: null as string | null, q: 'Lisboa' } })
    expect(result.current.status).toBe('idle')
    rerender({ cc: 'PT', q: ' L ' })
    expect(result.current.status).toBe('idle')
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('debounces typing and only requests the last query', async () => {
    const fetchMock = stubFetch((url) => (url.includes('name=Lisb') ? results(['Lisboa']) : results(['Other'])))
    const { result, rerender } = renderHook(({ q }) => useCitySearch('PT', q, 'pt-PT'), { initialProps: { q: 'Li' } })
    expect(result.current.status).toBe('loading')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender({ q: 'Lis' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender({ q: 'Lisb' })
    expect(fetchMock).not.toHaveBeenCalled()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.searchParams.get('name')).toBe('Lisb')
    expect(url.searchParams.get('countryCode')).toBe('PT')
    expect(url.searchParams.get('language')).toBe('pt')
    expect(result.current.status).toBe('success')
    expect(result.current.results.map((r) => r.name)).toEqual(['Lisboa'])
  })

  it('aborts a superseded in-flight request', async () => {
    let resolveFirst: ((r: Response) => void) | undefined
    const fn = vi.fn((url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      if (String(url).includes('name=Por&')) return new Promise<Response>((r) => (resolveFirst = r))
      return Promise.resolve(jsonResponse(results(['Porto'])))
    })
    vi.stubGlobal('fetch', fn)
    const { result, rerender } = renderHook(({ q }) => useCitySearch('PT', q, 'en'), { initialProps: { q: 'Por' } })
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ q: 'Porto' })
    expect(signals[0]?.aborted).toBe(true)
    await flush()
    resolveFirst?.(jsonResponse(results(['Stale'])))
    await act(async () => {})
    expect(result.current.results.map((r) => r.name)).toEqual(['Porto'])
  })

  it('reports empty results', async () => {
    stubFetch(() => ({ generationtime_ms: 1 }))
    const { result } = renderHook(() => useCitySearch('PT', 'Xyzzy', 'en'))
    await flush()
    expect(result.current.status).toBe('empty')
    expect(result.current.results).toEqual([])
  })

  it('reports offline and API errors', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    stubFetch(() => results(['Lisboa']))
    const { result, rerender } = renderHook(({ q }) => useCitySearch('PT', q, 'en'), { initialProps: { q: 'Lisboa' } })
    await flush()
    expect(result.current.status).toBe('offline')
    expect(result.current.error?.code).toBe('offline')

    onLine.mockReturnValue(true)
    stubFetch(() => ({}), 503)
    rerender({ q: 'Braga' })
    await flush()
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('unavailable')
  })

  it('sanitises the query (trim, max 80 chars)', async () => {
    const fetchMock = stubFetch(() => results(['X']))
    const long = `  ${'a'.repeat(120)}  `
    const { result } = renderHook(() => useCitySearch('PT', long, 'en'))
    expect(result.current.query).toHaveLength(80)
    await flush()
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('name')).toHaveLength(80)
  })
})
