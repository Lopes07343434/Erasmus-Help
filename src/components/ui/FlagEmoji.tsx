import type { ReactNode } from 'react'

let cached: boolean | null = null

/**
 * Windows renders regional-indicator flags as two letters ("PT"). Detect real colour glyphs by drawing a
 * flag on a canvas and looking for coloured pixels. Cached; false when canvas is unavailable (tests/SSR).
 */
export function supportsFlagEmoji(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return (cached = false)
    ctx.textBaseline = 'top'
    ctx.font = '14px sans-serif'
    ctx.fillText('🇵🇹', 0, 0)
    const data = ctx.getImageData(0, 0, 16, 16).data
    let colored = false
    for (let i = 0; i < data.length && !colored; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if ((data[i + 3] ?? 0) > 0 && (Math.abs(r - g) > 40 || Math.abs(g - b) > 40)) colored = true
    }
    return (cached = colored)
  } catch {
    return (cached = false)
  }
}

/** Renders the flag emoji only where the platform draws real flags; otherwise `fallback` (default: nothing). */
export function FlagEmoji({ flag, className, fallback = null }: { flag: string; className?: string; fallback?: ReactNode }) {
  return supportsFlagEmoji() ? (
    <span aria-hidden="true" className={className}>
      {flag}
    </span>
  ) : (
    <>{fallback}</>
  )
}
