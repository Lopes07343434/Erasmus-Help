import { describe, expect, it } from 'vitest'
import { getChatErrorDetail } from './errors'
import {
  compareMessages,
  compareTimestamps,
  parseConversationRow,
  parseMemberRow,
  parseMessageRow,
  parseMyProfile,
  previewOf,
  toMicros,
  validateGroupName,
  validateMessageText,
  validatePublicId,
} from './mappers'
import { DIRECT, GROUP, ME, OTHER, conversationRow, groupRow, memberRow, myProfileRow, textRow, ts, uid } from './testUtils'

describe('timestamps', () => {
  it('keeps microsecond precision and understands every server format', () => {
    expect(compareTimestamps('2026-09-26T10:00:00.000001+00:00', '2026-09-26T10:00:00+00:00')).toBe(1)
    expect(toMicros('2026-09-26T10:00:00.123456+00:00')).toBe(toMicros('2026-09-26T10:00:00.123456Z'))
    expect(toMicros('2026-09-26 12:00:00.5+02')).toBe(toMicros('2026-09-26T10:00:00.500Z'))
    expect(toMicros('2026-09-26T10:00:00.123456')).toBe(toMicros('2026-09-26T10:00:00.123456Z'))
    expect(Number.isNaN(toMicros('yesterday'))).toBe(true)
  })

  it('orders messages by created_at then id', () => {
    const a = { id: uid(1), createdAt: ts(1) }
    const b = { id: uid(2), createdAt: ts(1) }
    const c = { id: uid(0), createdAt: ts(1, 1) }
    expect([c, b, a].sort(compareMessages).map((m) => m.id)).toEqual([uid(1), uid(2), uid(0)])
  })
})

describe('row parsers', () => {
  it('maps a message row (text and audio) and rejects malformed ones', () => {
    expect(parseMessageRow(textRow(uid(1), DIRECT, OTHER, ts(1), 'hi'))).toEqual({ id: uid(1), conversationId: DIRECT, senderId: OTHER, createdAt: ts(1), status: 'sent', kind: 'text', body: 'hi' })
    const audio = { ...textRow(uid(2), DIRECT, ME, ts(2)), kind: 'audio', body: null, audio_path: `${DIRECT}/${uid(9)}.webm`, audio_duration_ms: 1200, audio_mime: 'audio/webm' }
    expect(parseMessageRow(audio)).toMatchObject({ kind: 'audio', audioPath: `${DIRECT}/${uid(9)}.webm`, audioDurationMs: 1200, audioMime: 'audio/webm' })
    expect(parseMessageRow({ ...audio, audio_path: `${GROUP}/${uid(9)}.webm` })).toBeNull() // path outside the conversation
    expect(parseMessageRow({ ...audio, audio_mime: 'audio/webm;codecs=opus' })).toBeNull()
    expect(parseMessageRow({ ...textRow(uid(3), DIRECT, ME, ts(3)), id: 'nope' })).toBeNull()
    expect(parseMessageRow(null)).toBeNull()
  })

  it('maps list_my_conversations rows (json columns, caps unread)', () => {
    const row = conversationRow({
      unread_count: 250,
      last_message_at: ts(5),
      last_message: { id: uid(5), kind: 'text', preview: 'hey', audio_duration_ms: null, sender_id: OTHER, sender_name: 'Bruno', created_at: ts(5) },
    })
    expect(parseConversationRow(row)).toMatchObject({
      id: DIRECT,
      kind: 'direct',
      name: null,
      otherUser: { id: OTHER, publicId: 2, displayName: 'Bruno', role: 'monitor', avatarPath: null },
      lastMessage: { id: uid(5), preview: 'hey', senderName: 'Bruno' },
      unreadCount: 100,
    })
    expect(parseConversationRow(groupRow())).toMatchObject({ kind: 'group', name: 'Erasmus Milano', otherUser: null })
    expect(parseConversationRow(groupRow({ name: null }))).toBeNull()
    expect(parseConversationRow({ ...groupRow(), my_role: 'owner' })).toBeNull()
  })

  it('maps members and my profile', () => {
    expect(parseMemberRow(memberRow(OTHER, 2, 'Bruno', ts(3), { member_role: 'manager', role: 'monitor' }))).toEqual({
      id: OTHER,
      publicId: 2,
      displayName: 'Bruno',
      role: 'monitor',
      avatarPath: null,
      memberRole: 'manager',
      joinedAt: ts(0),
      lastReadAt: ts(3),
    })
    expect(parseMyProfile(myProfileRow())).toMatchObject({ id: ME, publicId: 7, myLanguage: 'pt-PT', appLanguage: 'pt-PT', countryCode: 'IT', city: 'Milano', monitorStatus: null })
    expect(parseMyProfile({ ...myProfileRow(), public_id: 0 })).toBeNull()
  })
})

describe('validation', () => {
  it('trims message text like the server and enforces 1..4000 code points', () => {
    expect(validateMessageText('  olá \n')).toBe('olá')
    expect(() => validateMessageText('   ')).toThrow()
    expect(validateMessageText('😀'.repeat(4000))).toHaveLength(8000) // 4000 code points
    let error: unknown
    try {
      validateMessageText('a'.repeat(4001))
    } catch (e) {
      error = e
    }
    expect(getChatErrorDetail(error)).toBe('invalid_input')
  })

  it('cleans group names (1..60) and public ids', () => {
    expect(validateGroupName('  Erasmus   Milano\t2026 ')).toBe('Erasmus Milano 2026')
    expect(() => validateGroupName('x'.repeat(61))).toThrow()
    expect(() => validateGroupName(' ​ ')).toThrow()
    expect(validatePublicId(7)).toBe(7)
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => validatePublicId(bad)).toThrow()
  })

  it('builds single-line previews of ≤120 chars', () => {
    expect(previewOf('a\n\nb')).toBe('a b')
    expect(previewOf('x'.repeat(200))).toHaveLength(120)
  })
})
