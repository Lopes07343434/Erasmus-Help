import { beforeAll, describe, expect, it } from 'vitest'
import { formatUnread } from '@/components/navigation/formatUnread'
import { createTranslator, loadMessages } from '@/i18n/catalog'
import type { I18nValue } from '@/i18n/I18nProvider'
import { AppError } from '@/services/errors'
import { chatErrorCode, chatErrorMessage } from './chatErrors'
import { calendarDaysAgo, formatDayLabel, formatListTime, groupByDay, lastMessageParts, previewLine, publicIdLabel, sortMembers } from './chatFormat'
import { canCreateGroups, canDeleteGroup, canManageGroup } from './chatPermissions'
import { makeMe, member, MONITOR, STUDENT_ANA } from './testFixtures'

let i18n: Pick<I18nValue, 't' | 'formatDate'>

beforeAll(async () => {
  const messages = await loadMessages('pt-PT')
  const { t } = createTranslator('pt-PT', messages)
  i18n = { t, formatDate: (d, o) => new Intl.DateTimeFormat('pt-PT', o).format(d) }
})

// Local wall-clock dates (the helpers work in the device's time zone).
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

describe('formatUnread', () => {
  it('caps at 99+', () => {
    expect(formatUnread(0)).toBe('0')
    expect(formatUnread(7)).toBe('7')
    expect(formatUnread(99)).toBe('99')
    expect(formatUnread(100)).toBe('99+')
    expect(formatUnread(Number.NaN)).toBe('0')
  })
})

describe('dates', () => {
  const now = at(2026, 9, 26, 15, 30)

  it('counts calendar days, not 24 h periods', () => {
    expect(calendarDaysAgo(at(2026, 9, 26, 0, 1), now)).toBe(0)
    expect(calendarDaysAgo(at(2026, 9, 25, 23, 59), now)).toBe(1)
    expect(calendarDaysAgo(at(2026, 9, 19), now)).toBe(7)
  })

  it('list time: today → time, yesterday, weekday this week, then the date', () => {
    expect(formatListTime(at(2026, 9, 26, 9, 5).toISOString(), now, i18n)).toBe('09:05')
    expect(formatListTime(at(2026, 9, 25, 9, 5).toISOString(), now, i18n)).toBe('Ontem')
    expect(formatListTime(at(2026, 9, 22).toISOString(), now, i18n)).toBe(new Intl.DateTimeFormat('pt-PT', { weekday: 'short' }).format(at(2026, 9, 22)))
    expect(formatListTime(at(2026, 3, 2).toISOString(), now, i18n)).toBe(new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(at(2026, 3, 2)))
    expect(formatListTime(at(2025, 12, 31).toISOString(), now, i18n)).toBe('31/12/25')
    expect(formatListTime(null, now, i18n)).toBe('')
    expect(formatListTime('not a date', now, i18n)).toBe('')
  })

  it('day separators: Hoje / Ontem / long date', () => {
    expect(formatDayLabel(at(2026, 9, 26), now, i18n)).toBe('Hoje')
    expect(formatDayLabel(at(2026, 9, 25), now, i18n)).toBe('Ontem')
    expect(formatDayLabel(at(2026, 9, 1), now, i18n)).toMatch(/1 de setembro/)
  })

  it('groups chronological messages by local day', () => {
    const items = [
      { id: 'a', createdAt: at(2026, 9, 25, 22).toISOString() },
      { id: 'b', createdAt: at(2026, 9, 25, 23).toISOString() },
      { id: 'c', createdAt: at(2026, 9, 26, 8).toISOString() },
    ]
    const days = groupByDay(items)
    expect(days.map((d) => d.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']])
  })
})

describe('previews', () => {
  const base = { id: 'm', senderName: 'Ana Costa', createdAt: '2026-09-26T10:00:00Z' }

  it('prefixes my messages with "Tu" and group messages with the sender', () => {
    const mine = lastMessageParts({ ...base, kind: 'text', preview: 'Olá', audioDurationMs: null, senderId: 'u-me' }, 'direct', 'u-me', i18n)
    expect(mine && previewLine(mine, i18n)).toBe('Tu: Olá')
    const theirsDirect = lastMessageParts({ ...base, kind: 'text', preview: 'Olá', audioDurationMs: null, senderId: 'u-ana' }, 'direct', 'u-me', i18n)
    expect(theirsDirect && previewLine(theirsDirect, i18n)).toBe('Olá')
    const theirsGroup = lastMessageParts({ ...base, kind: 'text', preview: 'Olá', audioDurationMs: null, senderId: 'u-ana' }, 'group', 'u-me', i18n)
    expect(theirsGroup && previewLine(theirsGroup, i18n)).toBe('Ana Costa: Olá')
  })

  it('shows voice messages as "Áudio m:ss"', () => {
    const audio = lastMessageParts({ ...base, kind: 'audio', preview: null, audioDurationMs: 12_400, senderId: 'u-ana' }, 'direct', 'u-me', i18n)
    expect(audio).toEqual({ sender: null, audio: true, text: 'Áudio 0:12' })
    expect(lastMessageParts(null, 'group', 'u-me', i18n)).toBeNull()
  })

  it('formats public IDs without throwing', () => {
    expect(publicIdLabel(7)).toBe('ID: 07')
    expect(publicIdLabel(15)).toBe('ID: 15')
    expect(publicIdLabel(0)).toBe('')
  })

  it('sorts managers first, then by name', () => {
    const sorted = sortMembers([member(STUDENT_ANA), member(MONITOR, 'manager'), member({ ...STUDENT_ANA, id: 'x', displayName: 'Beatriz' })], 'pt-PT')
    expect(sorted.map((m) => m.displayName)).toEqual(['João Pereira', 'Ana Costa', 'Beatriz'])
  })
})

describe('permissions', () => {
  it('anyone creates groups; group administrators or platform admins manage them', () => {
    // everyone with a chat account can create groups; group administrators (or platform admins) manage them
    expect(canCreateGroups(makeMe({ role: 'student' }))).toBe(true)
    expect(canCreateGroups(makeMe({ role: 'monitor', monitorStatus: 'pending' }))).toBe(true)
    expect(canCreateGroups(null)).toBe(false)
    expect(canManageGroup(makeMe({ role: 'student' }), { myRole: 'manager' })).toBe(true)
    expect(canManageGroup(makeMe({ role: 'monitor', monitorStatus: 'verified' }), { myRole: 'member' })).toBe(false)
    expect(canManageGroup(makeMe({ role: 'admin' }), { myRole: 'member' })).toBe(true)
    expect(canDeleteGroup(makeMe({ role: 'admin' }))).toBe(true)
    expect(canDeleteGroup(makeMe({ role: 'student' }))).toBe(false)
  })
})

describe('chat errors', () => {
  it('finds the chat reason on ChatError-like values, PostgREST errors and causes', () => {
    expect(chatErrorCode({ chatCode: 'last_manager' })).toBe('last_manager')
    expect(chatErrorCode({ code: 'P0001', message: 'already_member' })).toBe('already_member')
    expect(chatErrorCode(new AppError('permission-denied', { code: 'P0001', message: 'not_allowed' }))).toBe('not_allowed')
    expect(chatErrorCode({ code: 'anonymous_provider_disabled' })).toBe('anonymous_disabled')
    expect(chatErrorCode(new AppError('not-found'))).toBeNull()
  })

  it('maps to localized, non-technical messages', () => {
    expect(chatErrorMessage({ chatCode: 'not_found' }, i18n)).toBe('Nenhum utilizador encontrado com esse ID.')
    expect(chatErrorMessage(new AppError('not-found'), i18n, { notFound: 'person' })).toBe('Nenhum utilizador encontrado com esse ID.')
    expect(chatErrorMessage(new AppError('offline'), i18n)).toBe('Sem ligação à internet')
    expect(chatErrorMessage(new Error('duplicate key value violates…'), i18n)).toBe('Algo correu mal')
  })
})
