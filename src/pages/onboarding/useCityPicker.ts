import { useState } from 'react'
import { useCitySearch } from '@/hooks/useCitySearch'
import { useI18n } from '@/i18n/I18nProvider'
import { CITY_QUERY_MIN_LENGTH, sanitizeCityQuery, type CityResult } from '@/services/geo'
import type { CityLocation } from '@/types/profile'

export const cityFromResult = (r: CityResult): CityLocation => ({
  name: r.name,
  latitude: r.latitude,
  longitude: r.longitude,
  timezone: r.timezone,
  admin1: r.admin1,
})

interface UseCityPickerOptions {
  countryCode: string | null
  /** The chosen city (null while the user is still typing). */
  value: CityLocation | null
  onChange: (city: CityLocation | null) => void
}

/**
 * City autocomplete state: the typed query, geocoding results and the chosen city.
 * Typing clears the choice; when search is offline/unavailable the typed name can be used as is
 * (saved without coordinates — the weather resolves it later).
 */
export function useCityPicker({ countryCode, value, onChange }: UseCityPickerOptions) {
  const { locale } = useI18n()
  const [query, setQuery] = useState(value?.name ?? '')
  const search = useCitySearch(countryCode, query, locale)
  const typed = sanitizeCityQuery(query)
  const canUseTyped = !value && (search.status === 'offline' || search.status === 'error') && typed.length >= CITY_QUERY_MIN_LENGTH

  const selectedId =
    value && value.latitude !== undefined
      ? (search.results.find((r) => r.name === value.name && r.latitude === value.latitude && r.longitude === value.longitude)?.id ?? null)
      : null

  const type = (text: string) => {
    setQuery(text)
    if (value) onChange(null)
  }

  const selectResult = (id: string) => {
    const result = search.results.find((r) => r.id === id)
    if (!result) return
    setQuery(result.name)
    onChange(cityFromResult(result))
  }

  const keepTyped = () => {
    if (typed.length >= CITY_QUERY_MIN_LENGTH) onChange({ name: typed })
  }

  /** Enter: pick the best match, or keep the typed name when search is unavailable. */
  const submit = () => {
    const first = search.results[0]
    if (!value && search.status === 'success' && first) selectResult(first.id)
    else if (canUseTyped) keepTyped()
  }

  return { query, typed, search, selectedId, canUseTyped, type, clear: () => type(''), selectResult, keepTyped, submit }
}
