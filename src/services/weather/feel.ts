import type { Feel } from './types'
import { roundTemperature } from './format'

/**
 * Thermal feel label, computed from the apparent ("feels like") temperature, falling back to the
 * air temperature when the provider has no apparent value.
 *
 * Thresholds (°C, applied to the value ROUNDED to an integer, so the label always agrees with the
 * number the UI shows — e.g. 15.6 is displayed as "16°" and labelled comfortable, not cool):
 *   ≤ 7   cold         (frio)
 *   8–15  cool         (fresco)
 *   16–24 comfortable  (confortável)
 *   ≥ 25  hot          (quente)
 */
export const FEEL_THRESHOLDS = {
  /** Lowest rounded value that is no longer "cold". */
  coolFrom: 8,
  /** Lowest rounded value that is "comfortable". */
  comfortableFrom: 16,
  /** Lowest rounded value that is "hot". */
  hotFrom: 25,
} as const

export function feelFromTemperature(celsius: number): Feel {
  const t = roundTemperature(celsius)
  if (t < FEEL_THRESHOLDS.coolFrom) return 'cold'
  if (t < FEEL_THRESHOLDS.comfortableFrom) return 'cool'
  if (t < FEEL_THRESHOLDS.hotFrom) return 'comfortable'
  return 'hot'
}

/** Feel for a snapshot: apparent temperature when available, else air temperature. */
export function computeFeel(temperature: number, apparentTemperature: number | null): Feel {
  return feelFromTemperature(apparentTemperature ?? temperature)
}
