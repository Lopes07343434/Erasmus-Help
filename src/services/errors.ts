/**
 * Shared error vocabulary. Services throw AppError; UI maps `code` to a localized message
 * (i18n namespace `errors`). Never surface raw backend messages, stack traces or URLs to users.
 */
export type AppErrorCode =
  | 'offline'
  | 'timeout'
  | 'unavailable'
  | 'not-configured'
  | 'not-supported'
  | 'permission-denied'
  | 'no-speech'
  | 'invalid-input'
  | 'not-found'
  | 'rate-limited'
  | 'aborted'
  | 'unknown'

export class AppError extends Error {
  readonly code: AppErrorCode
  override readonly cause?: unknown

  constructor(code: AppErrorCode, cause?: unknown) {
    super(code)
    this.name = 'AppError'
    this.code = code
    this.cause = cause
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof DOMException && err.name === 'AbortError') return new AppError('aborted', err)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AppError('offline', err)
  return new AppError('unknown', err)
}

export const isAbort = (err: unknown): boolean => err instanceof AppError && err.code === 'aborted'
