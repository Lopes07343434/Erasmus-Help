/**
 * Pure helpers of the `push` Edge Function (no Deno / network imports, so Vitest can test them:
 * src/services/notifications/pushFunction.test.ts).
 */

export type PushLocale = 'pt-PT' | 'en' | 'pl'

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

/** What the service worker (public/sw-notifications.js) expects in a push event. */
export interface PushNotificationPayload {
  title: string
  body: string
  tag: string
  url: string
  lang: PushLocale
}

export interface NotificationSource {
  conversationId: string
  conversationKind: 'direct' | 'group'
  conversationName: string | null
  senderName: string | null
  messageKind: 'text' | 'audio'
  body: string | null
  audioDurationMs: number | null
}

const STRINGS: Record<PushLocale, { group: string; audio: string; someone: string; untitledGroup: string; newMessage: string }> = {
  'pt-PT': { group: 'Grupo · {group}', audio: 'Áudio {duration}', someone: 'Alguém', untitledGroup: 'Grupo', newMessage: 'Nova mensagem' },
  en: { group: 'Group · {group}', audio: 'Audio {duration}', someone: 'Someone', untitledGroup: 'Group', newMessage: 'New message' },
  pl: { group: 'Grupa · {group}', audio: 'Audio {duration}', someone: 'Ktoś', untitledGroup: 'Grupa', newMessage: 'Nowa wiadomość' },
}

export const BODY_MAX_CHARS = 140

/** Web push services we are willing to POST to. Prevents the function from being used to reach arbitrary hosts. */
const PUSH_HOSTS: ReadonlyArray<{ host: string; suffix: boolean }> = [
  { host: 'fcm.googleapis.com', suffix: false },
  { host: 'updates.push.services.mozilla.com', suffix: false },
  { host: '.push.services.mozilla.com', suffix: true },
  { host: '.push.apple.com', suffix: true },
  { host: '.notify.windows.com', suffix: true },
]

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '' || value.length > 2048) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.some((h) => (h.suffix ? host.endsWith(h.host) : host === h.host))
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** Validates the `subscription` of a /subscribe body (a PushSubscriptionJSON). */
export function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!isRecord(value) || typeof value.endpoint !== 'string' || !isRecord(value.keys)) return null
  const { p256dh, auth } = value.keys
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!isAllowedPushEndpoint(value.endpoint)) return null
  if (!BASE64URL.test(p256dh) || p256dh.length > 256 || !BASE64URL.test(auth) || auth.length > 64) return null
  return { endpoint: value.endpoint, p256dh, auth }
}

export function normalizeLocale(value: unknown): PushLocale | null {
  return value === 'pt-PT' || value === 'en' || value === 'pl' ? value : null
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')
  return `${Math.floor(total / 60)}:${seconds}`
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`
}

/** Same wording as the in-app system notification (src/pages/chat/components/systemNotifications.ts). */
export function buildNotification(source: NotificationSource, locale: PushLocale): PushNotificationPayload {
  const s = STRINGS[locale]
  const text =
    source.messageKind === 'audio'
      ? s.audio.replace('{duration}', formatDuration(source.audioDurationMs ?? 0))
      : truncate(source.body ?? '', BODY_MAX_CHARS)
  const sender = source.senderName?.trim() || ''
  const group = source.conversationKind === 'group'
  const groupName = source.conversationName?.trim() || s.untitledGroup
  return {
    title: group ? s.group.replace('{group}', groupName) : sender || s.someone,
    body: (group ? `${sender || s.someone}: ${text}` : text) || s.newMessage,
    tag: source.conversationId,
    url: `/chat/${source.conversationId}`,
    lang: locale,
  }
}

/** Constant-time comparison for the webhook secret. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
