import { describe, expect, it } from 'vitest'
import { Constants } from '@/services/supabase/database.types'
import { CHAT_RPC_ERRORS, formatPublicId, parseChatRpcError, parsePublicId, type UserRole } from './types'

describe('formatPublicId', () => {
  it('pads to two digits and never truncates', () => {
    expect(formatPublicId(1)).toBe('ID 01')
    expect(formatPublicId(9)).toBe('ID 09')
    expect(formatPublicId(10)).toBe('ID 10')
    expect(formatPublicId(123)).toBe('ID 123')
    expect(formatPublicId(100000)).toBe('ID 100000')
  })

  it('rejects values the database can never produce', () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatPublicId(n), String(n)).toThrow(RangeError)
    }
  })
})

describe('parsePublicId', () => {
  it('accepts the formats people type', () => {
    expect(parsePublicId('ID 01')).toBe(1)
    expect(parsePublicId('id7')).toBe(7)
    expect(parsePublicId('#7')).toBe(7)
    expect(parsePublicId(' 07 ')).toBe(7)
    expect(parsePublicId('Id #123')).toBe(123)
  })

  it('round-trips with formatPublicId', () => {
    for (const n of [1, 2, 42, 999, 123456]) expect(parsePublicId(formatPublicId(n))).toBe(n)
  })

  it('rejects everything else', () => {
    for (const s of ['', '   ', 'ID', '0', 'ID 00', '-3', '1.5', '1e3', '12a', 'ID 1 2', '1234567890123456']) {
      expect(parsePublicId(s), s).toBeNull()
    }
  })
})

describe('parseChatRpcError', () => {
  it('reads the code from a PostgREST P0001 error', () => {
    expect(parseChatRpcError({ code: 'P0001', message: 'already_associated', details: null, hint: null })).toBe('already_associated')
    expect(parseChatRpcError({ message: 'not_allowed' })).toBe('not_allowed')
  })

  it('ignores unknown messages, other SQLSTATEs and non-objects', () => {
    expect(parseChatRpcError({ code: 'P0001', message: 'boom' })).toBeNull()
    expect(parseChatRpcError({ code: '42501', message: 'not_allowed' })).toBeNull()
    expect(parseChatRpcError('not_allowed')).toBeNull()
    expect(parseChatRpcError(null)).toBeNull()
  })

  it('knows every documented code', () => {
    expect(CHAT_RPC_ERRORS).toHaveLength(9)
    for (const code of CHAT_RPC_ERRORS) expect(parseChatRpcError({ code: 'P0001', message: code })).toBe(code)
  })
})

describe('database enums', () => {
  it('match the domain role type', () => {
    const roles: readonly UserRole[] = Constants.public.Enums.user_role
    expect([...roles].sort()).toEqual(['admin', 'monitor', 'student'])
  })
})
