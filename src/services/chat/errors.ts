/**
 * Chat error mapping: PostgREST / Auth / Storage / network failures → AppError codes the UI already
 * localizes (namespace `errors`). Chat-specific reasons (RPC codes such as 'archived' or
 * 'already_member', 'anonymous_disabled', …) are kept on `ChatError.detail` so the UI can show a
 * more precise message (namespace `chat.errors.*`) and fall back to `code` otherwise.
 *
 * Never put raw backend messages in the UI: they stay in `cause` (and are never logged here).
 */
import { AppError, type AppErrorCode } from '@/services/errors'
import type { ChatErrorCode } from './api'
import { parseChatRpcError } from './types'

export type ChatErrorDetail =
  | ChatErrorCode
  /** The request had no valid session (expired/revoked) → the session is re-established on retry. */
  | 'not_authenticated'
  /** Supabase project has anonymous sign-ins (or sign-ups) disabled. */
  | 'anonymous_disabled'
  /** Supabase project requires a CAPTCHA token for sign-in (not supported by this build). */
  | 'captcha_required'

export class ChatError extends AppError {
  readonly detail: ChatErrorDetail | null

  constructor(code: AppErrorCode, detail: ChatErrorDetail | null = null, cause?: unknown) {
    super(code, cause)
    this.name = 'ChatError'
    this.detail = detail
  }

  /** Alias of `detail` (the UI's chatErrorCode() helper reads `chatCode`). */
  get chatCode(): ChatErrorDetail | null {
    return this.detail
  }
}

/** Chat-specific reason of an error (null for generic errors). */
export function getChatErrorDetail(err: unknown): ChatErrorDetail | null {
  return err instanceof ChatError ? err.detail : null
}

const RPC_CODE_MAP: Record<Exclude<ReturnType<typeof parseChatRpcError>, null>, [AppErrorCode, ChatErrorDetail]> = {
  not_authenticated: ['permission-denied', 'not_authenticated'],
  not_allowed: ['permission-denied', 'not_allowed'],
  not_found: ['not-found', 'not_found'],
  invalid_input: ['invalid-input', 'invalid_input'],
  already_associated: ['invalid-input', 'already_associated'],
  already_member: ['invalid-input', 'already_member'],
  not_verified: ['permission-denied', 'not_verified'],
  archived: ['permission-denied', 'archived'],
  last_manager: ['permission-denied', 'last_manager'],
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
const networkError = (cause: unknown) => new AppError(isOffline() ? 'offline' : 'unavailable', cause)

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function fromHttpStatus(status: number | null, cause: unknown): AppError | null {
  if (status === null) return null
  if (status === 0) return networkError(cause)
  if (status === 429) return new AppError('rate-limited', cause)
  if (status === 401) return new ChatError('permission-denied', 'not_authenticated', cause)
  if (status === 403) return new AppError('permission-denied', cause)
  if (status === 404) return new AppError('not-found', cause)
  if (status === 408 || status === 504) return new AppError('timeout', cause)
  if (status >= 500) return new AppError('unavailable', cause)
  return null
}

function isAbortLike(name: string, message: string): boolean {
  return name === 'AbortError' || message.startsWith('AbortError')
}

/** Supabase Auth errors (AuthApiError / AuthRetryableFetchError / …), duck-typed. */
function mapAuthError(err: { name: string; code: string; status: number | null; message: string }, cause: unknown): AppError {
  const code = err.code
  const message = err.message.toLowerCase()
  if (code === 'anonymous_provider_disabled' || code === 'signup_disabled' || message.includes('anonymous sign-ins are disabled') || message.includes('signups not allowed')) {
    return new ChatError('not-configured', 'anonymous_disabled', cause)
  }
  if (code === 'captcha_failed' || message.includes('captcha')) return new ChatError('not-configured', 'captcha_required', cause)
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err.status === 429) return new AppError('rate-limited', cause)
  if (code === 'request_timeout') return new AppError('timeout', cause)
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    code === 'bad_jwt' ||
    code === 'user_not_found' ||
    err.name === 'AuthSessionMissingError'
  ) {
    return new ChatError('permission-denied', 'not_authenticated', cause)
  }
  if (err.name === 'AuthRetryableFetchError' || err.status === 0) return networkError(cause)
  return fromHttpStatus(err.status, cause) ?? new AppError('unknown', cause)
}

/** Supabase Storage errors (StorageApiError / StorageUnknownError), duck-typed. */
function mapStorageError(err: { name: string; status: number | null; statusCode: string; code: string; message: string }, cause: unknown): AppError {
  if (err.name === 'StorageUnknownError') return networkError(cause)
  const sc = err.statusCode || String(err.status ?? '')
  const code = err.code
  if (code === 'InvalidMimeType' || code === 'EntityTooLarge' || code === 'InvalidKey' || sc === '413' || sc === '415' || sc === '422') {
    return new AppError('invalid-input', cause)
  }
  if (code === 'AccessDenied' || code === 'Unauthorized' || sc === '403') return new AppError('permission-denied', cause)
  if (code === 'NoSuchKey' || code === 'NoSuchBucket' || sc === '404') return new AppError('not-found', cause)
  if (code === 'SlowDown' || sc === '429') return new AppError('rate-limited', cause)
  const status = err.status ?? (Number.parseInt(sc, 10) || null)
  // RLS rejections from Storage come back as 400 "new row violates row-level security policy".
  if (err.message.toLowerCase().includes('row-level security')) return new AppError('permission-denied', cause)
  return fromHttpStatus(status, cause) ?? new AppError('unknown', cause)
}

/** PostgREST errors ({ code, message, details, hint }) — `status` from the response when known. */
function mapPostgrestError(code: string, message: string, status: number | null, cause: unknown): AppError {
  const rpc = parseChatRpcError({ code, message })
  if (rpc) {
    const [appCode, detail] = RPC_CODE_MAP[rpc]
    return new ChatError(appCode, detail, cause)
  }
  if (code === '') {
    if (isAbortLike('', message)) return new AppError('aborted', cause)
    // fetch failed before any HTTP response (offline, DNS, CORS, …)
    if (status === 0 || status === null || message.startsWith('TypeError') || message.startsWith('FetchError')) return fromHttpStatus(status, cause) ?? networkError(cause)
  }
  switch (code) {
    case '42501': // insufficient privilege / row-level security violation
      return new AppError('permission-denied', cause)
    case 'PGRST301': // JWT invalid / expired
    case 'PGRST302':
    case 'PGRST303':
      return new ChatError('permission-denied', 'not_authenticated', cause)
    case 'PGRST116': // .single() without a row
    case '23503': // foreign key → target vanished
      return new AppError('not-found', cause)
    case '23505':
    case '23514':
    case '23502':
    case '22P02':
    case '22001':
    case '22023':
      return new AppError('invalid-input', cause)
    case '57014': // statement timeout
      return new AppError('timeout', cause)
    case 'PGRST202': // function not found → migrations not applied
    case 'PGRST205': // table not found
    case 'PGRST002': // schema cache not ready
      return new AppError('unavailable', cause)
  }
  return fromHttpStatus(status, cause) ?? new AppError('unknown', cause)
}

/**
 * Any error thrown/returned by supabase-js (or fetch) → AppError / ChatError.
 * `status` is the HTTP status of the PostgREST response when available (0 = network failure).
 */
export function toChatError(err: unknown, status?: number | null): AppError {
  if (err instanceof AppError) return err
  if (err instanceof DOMException && err.name === 'AbortError') return new AppError('aborted', err)
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    const name = str(e.name)
    const message = str(e.message)
    if (e.__isAuthError === true || name.startsWith('Auth')) {
      return mapAuthError({ name, code: str(e.code), status: num(e.status), message }, err)
    }
    if (e.__isStorageError === true || name.startsWith('Storage')) {
      return mapStorageError({ name, status: num(e.status), statusCode: str(e.statusCode), code: str(e.code), message }, err)
    }
    if (err instanceof TypeError) return networkError(err)
    if ('code' in e || 'details' in e || 'hint' in e) {
      return mapPostgrestError(str(e.code), message, status ?? null, err)
    }
    if (isAbortLike(name, message)) return new AppError('aborted', err)
  }
  if (isOffline()) return new AppError('offline', err)
  return fromHttpStatus(status ?? null, err) ?? new AppError('unknown', err)
}
