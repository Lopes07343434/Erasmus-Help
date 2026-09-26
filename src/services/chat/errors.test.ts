import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/services/errors'
import { ChatError, getChatErrorDetail, toChatError } from './errors'

const pg = (code: string, message = 'x') => ({ code, message, details: '', hint: '' })

afterEach(() => vi.restoreAllMocks())

describe('toChatError — RPC codes (P0001)', () => {
  it.each([
    ['not_allowed', 'permission-denied'],
    ['not_found', 'not-found'],
    ['invalid_input', 'invalid-input'],
    ['already_associated', 'invalid-input'],
    ['already_member', 'invalid-input'],
    ['not_verified', 'permission-denied'],
    ['archived', 'permission-denied'],
    ['last_manager', 'permission-denied'],
    ['not_authenticated', 'permission-denied'],
  ] as const)('%s → %s with the chat code kept as detail', (rpc, code) => {
    const err = toChatError(pg('P0001', rpc), 400)
    expect(err).toBeInstanceOf(ChatError)
    expect(err.code).toBe(code)
    expect(getChatErrorDetail(err)).toBe(rpc)
    expect((err as ChatError).chatCode).toBe(rpc)
  })
})

describe('toChatError — PostgREST', () => {
  it('maps privileges / RLS, validation, missing rows and server state', () => {
    expect(toChatError(pg('42501'), 403).code).toBe('permission-denied')
    expect(toChatError(pg('23514'), 400).code).toBe('invalid-input')
    expect(toChatError(pg('23505'), 409).code).toBe('invalid-input')
    expect(toChatError(pg('PGRST116'), 406).code).toBe('not-found')
    expect(toChatError(pg('PGRST202'), 404).code).toBe('unavailable')
    expect(toChatError(pg('57014'), 500).code).toBe('timeout')
    expect(getChatErrorDetail(toChatError(pg('PGRST301'), 401))).toBe('not_authenticated')
  })

  it('maps network failures (status 0) to offline or unavailable', () => {
    const netErr = pg('', 'TypeError: Failed to fetch')
    expect(toChatError(netErr, 0).code).toBe('unavailable')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(toChatError(netErr, 0).code).toBe('offline')
  })

  it('maps HTTP statuses when there is no better signal', () => {
    expect(toChatError(pg('XX000'), 429).code).toBe('rate-limited')
    expect(toChatError(pg('XX000'), 503).code).toBe('unavailable')
    expect(toChatError(pg('XX000'), 400).code).toBe('unknown')
  })
})

describe('toChatError — Auth', () => {
  it('anonymous sign-ins disabled → not-configured / anonymous_disabled', () => {
    const err = toChatError(new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled'))
    expect(err.code).toBe('not-configured')
    expect(getChatErrorDetail(err)).toBe('anonymous_disabled')
  })

  it('rate limits, captcha and invalid sessions', () => {
    expect(toChatError(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')).code).toBe('rate-limited')
    expect(getChatErrorDetail(toChatError(new AuthApiError('captcha verification process failed', 400, 'captcha_failed')))).toBe('captcha_required')
    expect(getChatErrorDetail(toChatError(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found')))).toBe('not_authenticated')
  })

  it('retryable fetch errors → offline / unavailable', () => {
    expect(toChatError(new AuthRetryableFetchError('Failed to fetch', 0)).code).toBe('unavailable')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(toChatError(new AuthRetryableFetchError('Failed to fetch', 0)).code).toBe('offline')
  })
})

describe('toChatError — Storage and others', () => {
  const storageErr = (statusCode: string, code?: string, message = 'x') => ({ __isStorageError: true, name: 'StorageApiError', status: Number(statusCode), statusCode, code, message })

  it('maps storage API errors', () => {
    expect(toChatError(storageErr('413', 'EntityTooLarge')).code).toBe('invalid-input')
    expect(toChatError(storageErr('415', 'InvalidMimeType')).code).toBe('invalid-input')
    expect(toChatError(storageErr('403', 'AccessDenied')).code).toBe('permission-denied')
    expect(toChatError(storageErr('400', undefined, 'new row violates row-level security policy')).code).toBe('permission-denied')
    expect(toChatError(storageErr('429')).code).toBe('rate-limited')
    expect(toChatError({ __isStorageError: true, name: 'StorageUnknownError', message: 'Failed to fetch' }).code).toBe('unavailable')
  })

  it('keeps AppErrors, maps aborts and fetch TypeErrors', () => {
    const app = new AppError('timeout')
    expect(toChatError(app)).toBe(app)
    expect(toChatError(new DOMException('aborted', 'AbortError')).code).toBe('aborted')
    expect(toChatError(new TypeError('Failed to fetch')).code).toBe('unavailable')
    expect(toChatError('boom').code).toBe('unknown')
  })

  it('never exposes the raw message as the AppError message', () => {
    const err = toChatError(pg('P0001', 'archived'))
    expect(err.message).toBe('permission-denied')
  })
})
