/** Joins class names, skipping falsy parts. No conflict resolution: pass layout classes (margin, width, flex) via `className`, not visual overrides. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
