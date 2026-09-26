import { describe, expect, it } from 'vitest'
import { Constants } from '@/services/supabase/database.types'
import { CHAT_RPC_ERRORS, formatPublicId, formatPublicIdNumber, isPublicIdQuery, parseChatRpcError, parsePublicId, type UserRole } from './types'

describe('formatPublicId', () => {
  it('pads to two digits and never truncates', () => {
    expect(formatPublicId(1)).toBe('ID: 01')
    expect(formatPublicId(9)).toBe('ID: 09')
    expect(formatPublicId(10)).toBe('ID: 10')
    expect(formatPublicId(123)).toBe('ID: 123')
    expect(formatPublicId(100000)).toBe('ID: 100000')
  })

  it('shows 01…09, then 10, 11, …, 99, 100, 101 (the number alone)', () => {
    const shown = Array.from({ length: 101 }, (_, i) => formatPublicIdNumber(i + 1))
    expect(shown.slice(0, 11)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'])
    expect(shown.slice(97)).toEqual(['98', '99', '100', '101'])
    expect(new Set(shown).size).toBe(101)
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
    expect(parsePublicId('ID: 07')).toBe(7)
    expect(parsePublicId('id:15')).toBe(15)
    expect(parsePublicId('015')).toBe(15)
  })

  it('never confuses 01 with 010/011/012', () => {
    expect(parsePublicId('01')).toBe(1)
    expect(parsePublicId('010')).toBe(10)
    expect(parsePublicId('011')).toBe(11)
    expect(parsePublicId('012')).toBe(12)
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

describe('isPublicIdQuery', () => {
  it('matches what the server treats as an ID search', () => {
    for (const q of ['7', '07', 'ID 07', 'ID: 07', '#7', ' 015 ']) expect(isPublicIdQuery(q), q).toBe(true)
    for (const q of ['Ana', 'ID', 'Ana 7', '7a', '']) expect(isPublicIdQuery(q), q).toBe(false)
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
