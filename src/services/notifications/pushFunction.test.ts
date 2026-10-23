import { describe, expect, it } from 'vitest'
import { buildNotification, isAllowedPushEndpoint, normalizeLocale, parseSubscription, safeEqual } from '../../../supabase/functions/push/payload'

const base = {
  conversationId: '0b1c2d3e-0000-4000-8000-000000000001',
  conversationKind: 'direct' as const,
  conversationName: null,
  senderName: 'Ana',
  messageKind: 'text' as const,
  body: 'Olá!',
  audioDurationMs: null,
}

describe('push endpoint allow-list', () => {
  it('accepts the real push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://db5p.notify.windows.com/?token=abc')).toBe(true)
  })

  it('rejects anything else (SSRF guard)', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
  })
})

describe('parseSubscription', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNc_-abc', auth: 'x-Y_9' } }

  it('returns the validated fields', () => {
    expect(parseSubscription({ ...ok, expirationTime: null })).toEqual({ endpoint: ok.endpoint, p256dh: 'BNc_-abc', auth: 'x-Y_9' })
  })

  it('rejects malformed subscriptions', () => {
    expect(parseSubscription(null)).toBeNull()
    expect(parseSubscription({ endpoint: ok.endpoint })).toBeNull()
    expect(parseSubscription({ ...ok, keys: { p256dh: 'bad key!', auth: 'a' } })).toBeNull()
    expect(parseSubscription({ ...ok, keys: { p256dh: 'a', auth: 'x'.repeat(65) } })).toBeNull()
    expect(parseSubscription({ ...ok, endpoint: 'https://evil.example/x' })).toBeNull()
  })
})

describe('buildNotification', () => {
  it('direct text: sender as title, message as body, opens the conversation', () => {
    expect(buildNotification(base, 'pt-PT')).toEqual({
      title: 'Ana',
      body: 'Olá!',
      tag: base.conversationId,
      url: `/chat/${base.conversationId}`,
      lang: 'pt-PT',
    })
  })

  it('group text: group title and "sender: message"', () => {
    const n = buildNotification({ ...base, conversationKind: 'group', conversationName: 'Erasmus Milão' }, 'en')
    expect(n.title).toBe('Group · Erasmus Milão')
    expect(n.body).toBe('Ana: Olá!')
  })

  it('audio: localised label with m:ss', () => {
    expect(buildNotification({ ...base, messageKind: 'audio', body: null, audioDurationMs: 72_400 }, 'pt-PT').body).toBe('Áudio 1:12')
    expect(buildNotification({ ...base, messageKind: 'audio', body: null, audioDurationMs: 5_000 }, 'pl').body).toBe('Audio 0:05')
  })

  it('truncates long messages and falls back when names are missing', () => {
    const long = buildNotification({ ...base, body: 'a'.repeat(300) }, 'en')
    expect(Array.from(long.body)).toHaveLength(140)
    expect(long.body.endsWith('…')).toBe(true)
    expect(buildNotification({ ...base, senderName: null }, 'pl').title).toBe('Ktoś')
  })
})

describe('helpers', () => {
  it('normalizes only the UI locales', () => {
    expect(normalizeLocale('pl')).toBe('pl')
    expect(normalizeLocale('fr')).toBeNull()
    expect(normalizeLocale(undefined)).toBeNull()
  })

  it('compares secrets', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
