import { describe, expect, it } from 'vitest'
import { computeFeel, FEEL_THRESHOLDS, feelFromTemperature } from './feel'
import { formatDataAge, roundPercent, roundTemperature } from './format'

describe('feelFromTemperature', () => {
  it.each([
    [-15, 'cold'],
    [0, 'cold'],
    [7, 'cold'],
    [7.49, 'cold'],
    [7.5, 'cool'], // displayed as 8°
    [8, 'cool'],
    [15, 'cool'],
    [15.49, 'cool'],
    [15.5, 'comfortable'], // displayed as 16°
    [16, 'comfortable'],
    [24, 'comfortable'],
    [24.49, 'comfortable'],
    [24.5, 'hot'], // displayed as 25°
    [25, 'hot'],
    [40, 'hot'],
  ] as const)('%s °C → %s', (t, feel) => {
    expect(feelFromTemperature(t)).toBe(feel)
  })

  it('exposes the documented thresholds', () => {
    expect(FEEL_THRESHOLDS).toEqual({ coolFrom: 8, comfortableFrom: 16, hotFrom: 25 })
  })

  it('prefers the apparent temperature and falls back to air temperature', () => {
    expect(computeFeel(17, 6)).toBe('cold')
    expect(computeFeel(26, 20)).toBe('comfortable')
    expect(computeFeel(26, null)).toBe('hot')
  })
})

describe('format helpers', () => {
  it('rounds temperatures without negative zero', () => {
    expect(roundTemperature(18.4)).toBe(18)
    expect(roundTemperature(18.5)).toBe(19)
    expect(Object.is(roundTemperature(-0.3), 0)).toBe(true)
    expect(roundTemperature(-2.6)).toBe(-3)
  })

  it('clamps percentages', () => {
    expect(roundPercent(34.6)).toBe(35)
    expect(roundPercent(-3)).toBe(0)
    expect(roundPercent(140)).toBe(100)
  })

  it('formats the data age in the UI locale', () => {
    const now = Date.UTC(2026, 8, 25, 12, 0)
    expect(formatDataAge(now - 35 * 60_000, 'pt-PT', now)).toBe('há 35 minutos')
    expect(formatDataAge(now - 10_000, 'en', now)).toBe('1 minute ago')
    expect(formatDataAge(now - 3 * 3_600_000, 'en', now)).toBe('3 hours ago')
    expect(formatDataAge(now - 2 * 3_600_000, 'pl', now)).toBe('2 godziny temu')
    expect(formatDataAge(now - 25 * 3_600_000, 'en', now)).toBe('yesterday')
  })
})
