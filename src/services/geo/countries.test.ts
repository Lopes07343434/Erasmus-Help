import { describe, expect, it } from 'vitest'
import { isLanguageCode } from '@/i18n/languages'
import { COUNTRY_CODES, countryFlag, getCountries, getCountryName, isSupportedCountry, localLanguageOf, searchCountries } from './countries'

const EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']

describe('country list', () => {
  it('contains EU-27 + IS, LI, NO, MK, RS, TR + GB, CH with no duplicates', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
    expect([...COUNTRY_CODES].sort()).toEqual([...EU27, 'IS', 'LI', 'NO', 'MK', 'RS', 'TR', 'GB', 'CH'].sort())
    expect(isSupportedCountry('PT')).toBe(true)
    expect(isSupportedCountry('US')).toBe(false)
    expect(isSupportedCountry('EL')).toBe(false)
  })

  it.each(['pt-PT', 'en', 'pl'] as const)('is localised and sorted with the %s collator', (locale) => {
    const list = getCountries(locale)
    expect(list).toHaveLength(COUNTRY_CODES.length)
    const collator = new Intl.Collator(locale, { sensitivity: 'base' })
    for (let i = 1; i < list.length; i++) expect(collator.compare(list[i - 1]?.name ?? '', list[i]?.name ?? '')).toBeLessThanOrEqual(0)
    for (const c of list) expect(c.name).not.toBe(c.code)
  })

  it('uses the UI locale for names', () => {
    expect(getCountryName('DE', 'pt-PT')).toBe('Alemanha')
    expect(getCountryName('DE', 'en')).toBe('Germany')
    expect(getCountryName('DE', 'pl')).toBe('Niemcy')
    expect(getCountries('pt-PT')[0]?.code).toBe('DE') // "Alemanha"
  })

  it('builds regional-indicator flags', () => {
    expect(countryFlag('PT')).toBe('🇵🇹')
    expect(countryFlag('gb')).toBe('🇬🇧')
    expect(countryFlag('P1')).toBe('')
    expect(getCountries('en').find((c) => c.code === 'PL')?.flag).toBe('🇵🇱')
  })
})

describe('searchCountries', () => {
  it('returns everything for an empty query', () => {
    expect(searchCountries('  ', 'en')).toHaveLength(COUNTRY_CODES.length)
  })

  it('is accent- and case-insensitive', () => {
    expect(searchCountries('polon', 'pt-PT').map((c) => c.code)).toEqual(['PL']) // Polónia
    expect(searchCountries('ÁUSTRIA', 'pt-PT')[0]?.code).toBe('AT')
    expect(searchCountries('islandia', 'pt-PT')[0]?.code).toBe('IS') // Islândia
  })

  it('matches English and native names too', () => {
    expect(searchCountries('germany', 'pt-PT')[0]?.code).toBe('DE')
    expect(searchCountries('deutschland', 'pl')[0]?.code).toBe('DE')
    expect(searchCountries('polska', 'en')[0]?.code).toBe('PL')
    expect(searchCountries('espana', 'en')[0]?.code).toBe('ES')
  })

  it('ranks prefix matches before substring matches', () => {
    const codes = searchCountries('ia', 'en').map((c) => c.code)
    expect(codes.length).toBeGreaterThan(3)
    expect(searchCountries('it', 'en')[0]?.code).toBe('IT')
  })

  it('returns [] when nothing matches', () => {
    expect(searchCountries('zzzz', 'en')).toEqual([])
  })
})

describe('localLanguageOf', () => {
  it('maps only unambiguous countries to registry languages', () => {
    expect(localLanguageOf('PT')).toBe('pt-PT')
    expect(localLanguageOf('ES')).toBe('es')
    expect(localLanguageOf('FR')).toBe('fr')
    expect(localLanguageOf('DE')).toBe('de')
    expect(localLanguageOf('AT')).toBe('de')
    expect(localLanguageOf('IT')).toBe('it')
    expect(localLanguageOf('PL')).toBe('pl')
    expect(localLanguageOf('IE')).toBe('en')
    expect(localLanguageOf('GB')).toBe('en')
    expect(localLanguageOf('MT')).toBe('en')
    for (const cc of ['BE', 'CH', 'LU', 'FI', 'NL', 'SE', 'XX', 'toString', '']) expect(localLanguageOf(cc), cc).toBeUndefined()
  })

  it('only returns registry codes', () => {
    for (const cc of COUNTRY_CODES) {
      const lang = localLanguageOf(cc)
      if (lang !== undefined) expect(isLanguageCode(lang)).toBe(true)
    }
  })
})
