/**
 * Display helpers. Snapshots keep raw numbers; round only when rendering.
 */

/** Integer °C for display; never returns -0 (which would render as "-0°"). */
export function roundTemperature(celsius: number): number {
  const r = Math.round(celsius)
  return r === 0 ? 0 : r
}

/** Integer percentage 0–100 for display. */
export function roundPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * Localised age of the data, e.g. "há 35 minutos" / "35 minutes ago" / "35 minut temu", "ontem".
 * Used with the i18n message `weather.states.stale` ({ago}). Minutes are clamped to ≥ 1.
 */
export function formatDataAge(fetchedAt: number, locale: string, now: number = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const minutes = Math.max(1, Math.floor((now - fetchedAt) / 60_000))
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.floor(hours / 24), 'day')
}
