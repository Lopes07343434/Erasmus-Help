import { describe, expect, it } from 'vitest'
import ptWeather from '@/i18n/messages/pt-PT/weather'
import { WEATHER_CONDITIONS } from './types'
import { conditionFromWmo, WMO_CODES } from './wmo'

/** Every code documented by Open-Meteo (WMO 4677 subset). */
const DOCUMENTED = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]

describe('conditionFromWmo', () => {
  it('maps every documented WMO code', () => {
    for (const code of DOCUMENTED) expect(conditionFromWmo(code), `code ${code}`).not.toBeNull()
    expect(Object.keys(WMO_CODES).map(Number).sort((a, b) => a - b)).toEqual(DOCUMENTED)
  })

  it('reaches every condition, and every condition has a label', () => {
    const reached = new Set(Object.values(WMO_CODES))
    for (const c of WEATHER_CONDITIONS) {
      expect(reached.has(c), c).toBe(true)
      expect(ptWeather.conditions[c]).toBeTruthy()
    }
  })

  it('maps representative codes', () => {
    expect(conditionFromWmo(0)).toBe('clear')
    expect(conditionFromWmo(1)).toBe('mainlyClear')
    expect(conditionFromWmo(2)).toBe('partlyCloudy')
    expect(conditionFromWmo(3)).toBe('overcast')
    expect(conditionFromWmo(48)).toBe('fog')
    expect(conditionFromWmo(53)).toBe('drizzle')
    expect(conditionFromWmo(57)).toBe('freezingRain')
    expect(conditionFromWmo(65)).toBe('rain')
    expect(conditionFromWmo(66)).toBe('freezingRain')
    expect(conditionFromWmo(77)).toBe('snow')
    expect(conditionFromWmo(81)).toBe('rainShowers')
    expect(conditionFromWmo(86)).toBe('snowShowers')
    expect(conditionFromWmo(99)).toBe('thunderstorm')
  })

  it('returns null for unknown or malformed codes', () => {
    for (const bad of [4, 44, 50, 100, -1, 2.5, Number.NaN, '2', null, undefined, {}]) expect(conditionFromWmo(bad)).toBeNull()
    expect(conditionFromWmo('toString')).toBeNull()
  })
})
