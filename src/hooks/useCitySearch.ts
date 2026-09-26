import { useEffect, useMemo, useState } from 'react'
import { toAppError, type AppError } from '@/services/errors'
import { CITY_QUERY_MIN_LENGTH, sanitizeCityQuery, searchCities, type CityResult } from '@/services/geo'
import type { UiLocale } from '@/i18n/languages'
import { isCountryCode } from '@/utils/validation'

export type CitySearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'offline'

export interface UseCitySearchResult {
  /**
   * - idle:    no country or fewer than 2 characters → show a hint, no request;
   * - loading: debouncing / request in flight (`results` keeps the previous list for the same country);
   * - success: `results` has at least one city;
   * - empty:   no city matches;
   * - offline / error: `error.code` explains (offline, timeout, unavailable, rate-limited…).
   */
  status: CitySearchStatus
  results: CityResult[]
  error?: AppError
  /** The sanitised query actually searched (trimmed, collapsed, ≤ 80 chars). */
  query: string
}

export const CITY_SEARCH_DEBOUNCE_MS = 300

interface State {
  key: string
  countryCode: string
  status: 'success' | 'empty' | 'error' | 'offline'
  results: CityResult[]
  error?: AppError
}

const NO_RESULTS: CityResult[] = []

/** City autocomplete for onboarding / profile: debounced 300 ms, min 2 chars, superseded requests aborted. */
export function useCitySearch(countryCode: string | null | undefined, query: string, uiLocale: UiLocale): UseCitySearchResult {
  const q = sanitizeCityQuery(query)
  const cc = countryCode && isCountryCode(countryCode) ? countryCode : null
  const key = cc && q.length >= CITY_QUERY_MIN_LENGTH ? `${cc}|${uiLocale}|${q}` : null
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    if (!key || !cc) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCities(cc, q, { language: uiLocale, signal: controller.signal }).then(
        (results) => {
          if (!controller.signal.aborted) setState({ key, countryCode: cc, status: results.length > 0 ? 'success' : 'empty', results })
        },
        (err: unknown) => {
          const error = toAppError(err)
          if (controller.signal.aborted || error.code === 'aborted') return
          setState({ key, countryCode: cc, status: error.code === 'offline' ? 'offline' : 'error', results: NO_RESULTS, error })
        },
      )
    }, CITY_SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `key` already encodes cc, uiLocale and q, so listing them never causes extra runs.
  }, [key, cc, q, uiLocale])

  return useMemo<UseCitySearchResult>(() => {
    if (!key) return { status: 'idle', results: NO_RESULTS, query: q }
    if (state && state.key === key) return { status: state.status, results: state.results, error: state.error, query: q }
    return { status: 'loading', results: state && state.countryCode === cc ? state.results : NO_RESULTS, query: q }
  }, [key, state, q, cc])
}
