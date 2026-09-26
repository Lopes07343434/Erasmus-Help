import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import { jsonResponse, mockFetch } from '@/services/weather/testUtils'
import { clearGeocodingMemo, resolveCity, searchCities } from './index'
import { buildGeocodingUrl, parseGeocodingResponse, toApiLanguage } from './openMeteoGeocoding'
import { foldText, sanitizeCityQuery } from './text'

const place = (overrides: Record<string, unknown>) => ({
  id: 1,
  name: 'Milano',
  latitude: 45.46427,
  longitude: 9.18951,
  feature_code: 'PPLA',
  country_code: 'IT',
  admin1: 'Lombardia',
  timezone: 'Europe/Rome',
  population: 1_236_837,
  ...overrides,
})

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'not-app-error'
  }
  return undefined
}

beforeEach(() => clearGeocodingMemo())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('text helpers', () => {
  it('folds accents and special letters', () => {
    expect(foldText('Łódź')).toBe('lodz')
    expect(foldText('  Kraków ')).toBe('krakow')
    expect(foldText('Österreich')).toBe('osterreich')
    expect(foldText('Málaga')).toBe('malaga')
  })

  it('sanitises queries', () => {
    expect(sanitizeCityQuery('  Lis\u0000boa \n ')).toBe('Lisboa')
    expect(sanitizeCityQuery('a'.repeat(200))).toHaveLength(80)
  })

  it('maps UI locales to API languages', () => {
    expect(toApiLanguage('pt-PT')).toBe('pt')
    expect(toApiLanguage('pl')).toBe('pl')
    expect(toApiLanguage('EN')).toBe('en')
    expect(toApiLanguage(undefined)).toBe('en')
    expect(toApiLanguage('x')).toBe('en')
  })
})

describe('buildGeocodingUrl', () => {
  it('includes name, count, language, format and countryCode', () => {
    const url = new URL(buildGeocodingUrl('PT', 'Lisboa & Co', 'pt-PT'))
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
    expect(url.searchParams.get('name')).toBe('Lisboa & Co')
    expect(url.searchParams.get('count')).toBe('10')
    expect(url.searchParams.get('language')).toBe('pt')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('countryCode')).toBe('PT')
  })
})

describe('parseGeocodingResponse', () => {
  it('returns [] when there are no results', () => {
    expect(parseGeocodingResponse({ generationtime_ms: 0.5 }, 'IT')).toEqual([])
  })

  it('validates, filters to the country, dedupes and sorts by population', () => {
    const results = parseGeocodingResponse(
      {
        results: [
          place({ id: 10, name: 'Milano Marittima', population: 3_000, admin1: 'Emilia-Romagna' }),
          place({ id: 1 }),
          place({ id: 2, name: 'Milano', population: 500 }), // same name + region → duplicate
          place({ id: 1, name: 'Milano (dup id)' }), // same id → duplicate
          place({ id: 3, name: 'Milan', country_code: 'US', admin1: 'Michigan' }), // other country
          place({ id: 4, name: 'Italia', feature_code: 'PCLI' }), // not a populated place
          place({ id: 5, name: '', population: 10 }),
          place({ id: 6, latitude: 200 }),
          place({ id: 7, longitude: 'x' }),
          place({ id: 8, name: 'Milanello', population: undefined }),
          place({ id: 9, name: 'Milano', admin1: 'Milano', population: 20, timezone: '../../etc' }),
          'garbage',
          null,
        ],
      },
      'IT',
    )
    expect(results.map((r) => r.id)).toEqual(['1', '10', '9', '8'])
    expect(results[0]).toEqual({
      id: '1',
      name: 'Milano',
      admin1: 'Lombardia',
      countryCode: 'IT',
      latitude: 45.46427,
      longitude: 9.18951,
      timezone: 'Europe/Rome',
      population: 1_236_837,
    })
    // admin1 equal to the name is omitted; an invalid timezone is dropped.
    expect(results[2]).not.toHaveProperty('admin1')
    expect(results[2]).not.toHaveProperty('timezone')
    expect(results[3]).not.toHaveProperty('population')
  })

  it.each([
    ['null', null],
    ['array', []],
    ['error payload', { error: true, reason: 'x' }],
    ['results not an array', { results: 'x' }],
  ])('throws AppError(unavailable) for %s', (_label, payload) => {
    expect(codeOf(() => parseGeocodingResponse(payload, 'IT'))).toBe('unavailable')
  })
})

describe('searchCities / resolveCity', () => {
  it('skips the request for short queries and rejects invalid countries', async () => {
    const fetchMock = mockFetch(jsonResponse({ results: [place({})] }))
    await expect(searchCities('IT', ' M ')).resolves.toEqual([])
    await expect(searchCities('it', 'Milano')).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('memoises identical searches', async () => {
    const fetchMock = mockFetch(jsonResponse({ results: [place({})] }))
    await searchCities('IT', 'Milano', { language: 'pt-PT' })
    await searchCities('IT', '  milano ', { language: 'pt-PT' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await searchCities('IT', 'Milano', { language: 'pl' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolveCity prefers the exact (accent-insensitive) name match', async () => {
    mockFetch(
      jsonResponse({
        results: [place({ id: 1, name: 'Kraków', admin1: 'Małopolskie', country_code: 'PL', population: 800_000 }), place({ id: 2, name: 'Krakow am See', country_code: 'PL', admin1: 'X', population: 900_000 })],
      }),
    )
    const city = await resolveCity('PL', 'krakow')
    expect(city.id).toBe('1')
  })

  it('resolveCity falls back to the most populated result, or throws not-found', async () => {
    mockFetch(jsonResponse({ results: [place({ id: 1, name: 'Milano' })] }))
    await expect(resolveCity('IT', 'Milão')).resolves.toMatchObject({ id: '1' })
    clearGeocodingMemo()
    mockFetch(jsonResponse({}))
    await expect(resolveCity('IT', 'Atlantis')).rejects.toMatchObject({ code: 'not-found' })
    await expect(resolveCity('IT', '   ')).rejects.toMatchObject({ code: 'invalid-input' })
  })
})
