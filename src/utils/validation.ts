import { NAME_MAX_LENGTH } from '@/types/profile'

/** Collapses whitespace and strips control/invisible characters from user-typed text. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/** Names: letters (any script), marks, spaces, apostrophes, dots and hyphens. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u

export function validateName(raw: string): { ok: true; value: string } | { ok: false; reason: 'empty' | 'tooLong' | 'invalid' } {
  const value = sanitizeText(raw, NAME_MAX_LENGTH + 1)
  if (!value) return { ok: false, reason: 'empty' }
  if (value.length > NAME_MAX_LENGTH) return { ok: false, reason: 'tooLong' }
  if (!NAME_PATTERN.test(value)) return { ok: false, reason: 'invalid' }
  return { ok: true, value }
}

export const isCountryCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v)

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
