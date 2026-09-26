/**
 * Emergency numbers of the countries offered in onboarding (see countries.ts).
 *  - `general`: the number to show first. 112 in every country except the UK (999; 112 also works there).
 *  - `police` / `ambulance` / `fire`: listed only when the country ALSO keeps its own direct number for that
 *    service; when a service is reached through `general`, it is omitted.
 * Sources: national emergency services / European Commission 112 pages. 112 is recognised by every mobile
 * phone in Europe, so it is also the fallback for unknown countries.
 */
export interface EmergencyNumbers {
  general: string
  police?: string
  ambulance?: string
  fire?: string
}

const EU_112: EmergencyNumbers = { general: '112' }

const NUMBERS: Readonly<Record<string, EmergencyNumbers>> = {
  PT: EU_112,
  ES: { general: '112', police: '091', ambulance: '061', fire: '080' },
  FR: { general: '112', police: '17', ambulance: '15', fire: '18' },
  DE: { general: '112', police: '110' },
  AT: { general: '112', police: '133', ambulance: '144', fire: '122' },
  IT: { general: '112', police: '113', ambulance: '118', fire: '115' },
  PL: { general: '112', police: '997', ambulance: '999', fire: '998' },
  BE: { general: '112', police: '101' },
  NL: EU_112,
  LU: { general: '112', police: '113' },
  IE: { general: '112' },
  MT: EU_112,
  CY: EU_112,
  GR: { general: '112', police: '100', ambulance: '166', fire: '199' },
  BG: EU_112,
  RO: EU_112,
  HR: { general: '112', police: '192', ambulance: '194', fire: '193' },
  SI: { general: '112', police: '113' },
  SK: { general: '112', police: '158', ambulance: '155', fire: '150' },
  CZ: { general: '112', police: '158', ambulance: '155', fire: '150' },
  HU: { general: '112', police: '107', ambulance: '104', fire: '105' },
  DK: EU_112,
  SE: EU_112,
  FI: EU_112,
  EE: EU_112,
  LV: { general: '112', police: '110', ambulance: '113' },
  LT: EU_112,
  IS: EU_112,
  NO: { general: '112', police: '112', ambulance: '113', fire: '110' },
  LI: { general: '112', police: '117', ambulance: '144', fire: '118' },
  CH: { general: '112', police: '117', ambulance: '144', fire: '118' },
  TR: EU_112,
  RS: { general: '112', police: '192', ambulance: '194', fire: '193' },
  MK: { general: '112', police: '192', ambulance: '194', fire: '193' },
  GB: { general: '999' },
}

/** Numbers for a country code ("PL"); unknown or missing countries get the European 112. */
export function getEmergencyNumbers(countryCode: string | null | undefined): EmergencyNumbers {
  return countryCode && Object.hasOwn(NUMBERS, countryCode) ? (NUMBERS[countryCode] ?? EU_112) : EU_112
}
