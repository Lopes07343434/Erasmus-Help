import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES } from './countries'
import { getEmergencyNumbers } from './emergencyNumbers'

describe('getEmergencyNumbers', () => {
  it('has numbers for every country offered in onboarding', () => {
    for (const code of COUNTRY_CODES) expect(getEmergencyNumbers(code).general).toMatch(/^\d{3}$/)
  })

  it('uses the national numbers', () => {
    expect(getEmergencyNumbers('PL')).toEqual({ general: '112', police: '997', ambulance: '999', fire: '998' })
    expect(getEmergencyNumbers('FR').ambulance).toBe('15')
    expect(getEmergencyNumbers('GB').general).toBe('999')
  })

  it('falls back to 112 for unknown or missing countries', () => {
    expect(getEmergencyNumbers('US')).toEqual({ general: '112' })
    expect(getEmergencyNumbers(null)).toEqual({ general: '112' })
    expect(getEmergencyNumbers('toString')).toEqual({ general: '112' })
  })
})
