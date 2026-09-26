import type { AppErrorCode } from '@/services/errors'
import type { Messages } from '@/i18n/types'

type ErrorNs = keyof Messages['errors']

const ERROR_KEYS = {
  offline: 'offline',
  timeout: 'timeout',
  unavailable: 'unavailable',
  'not-configured': 'notConfigured',
  'not-supported': 'notSupported',
  'permission-denied': 'permissionDenied',
  'no-speech': 'noSpeech',
  'invalid-input': 'invalidInput',
  'not-found': 'notFound',
  'rate-limited': 'rateLimited',
  aborted: 'aborted',
  unknown: 'unknown',
} as const satisfies Record<AppErrorCode, ErrorNs>

export type ErrorI18nKey = `errors.${(typeof ERROR_KEYS)[AppErrorCode]}`

/** i18n base key for an AppErrorCode, e.g. 'not-configured' → 'errors.notConfigured' (use `${key}.title` / `${key}.body`). */
export function errorI18nKey(code: AppErrorCode): ErrorI18nKey {
  return `errors.${ERROR_KEYS[code] ?? 'unknown'}`
}
