import type { I18nValue } from '@/i18n/I18nProvider'
import { formatDuration } from '@/services/audio'
import { formatPublicId, formatPublicIdNumber, type ConversationSummary, type LastMessagePreview, type PublicProfile } from '@/services/chat/types'

type Fmt = Pick<I18nValue, 't' | 'formatDate'>
type Tr = Pick<I18nValue, 't'>

const DAY_MS = 86_400_000
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

/** "ID: 07" (empty for a malformed number instead of throwing while rendering). */
export function publicIdLabel(publicId: number): string {
  try {
    return formatPublicId(publicId)
  } catch {
    return ''
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole calendar days between `date` and `now` in local time (0 = today, 1 = yesterday; negative = future). DST-safe. */
export function calendarDaysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
}

export const localDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Bubble time ("14:05" / "2:05 PM"). */
export function formatMessageTime(iso: string, { formatDate }: Pick<I18nValue, 'formatDate'>): string {
  const d = parse(iso)
  return d ? formatDate(d, TIME) : ''
}

/** Conversation list time: today → time · yesterday → "Ontem" · last 6 days → weekday · else the date. */
export function formatListTime(iso: string | null, now: Date, { t, formatDate }: Fmt): string {
  const d = parse(iso)
  if (!d) return ''
  const days = calendarDaysAgo(d, now)
  if (days <= 0) return formatDate(d, TIME)
  if (days === 1) return t('chat.time.yesterday')
  if (days < 7) return formatDate(d, { weekday: 'short' })
  if (d.getFullYear() === now.getFullYear()) return formatDate(d, { day: 'numeric', month: 'short' })
  return formatDate(d, { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Day separator in a conversation: "Hoje", "Ontem", "segunda-feira, 3 de março" (+ year when not this year). */
export function formatDayLabel(date: Date, now: Date, { t, formatDate }: Fmt): string {
  const days = calendarDaysAgo(date, now)
  if (days <= 0) return t('chat.time.today')
  if (days === 1) return t('chat.time.yesterday')
  return formatDate(
    date,
    date.getFullYear() === now.getFullYear() ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' },
  )
}

export interface DayGroup<T> {
  key: string
  date: Date
  items: T[]
}

/** Splits chronological items into local calendar days (keeps order; unparsable dates join the previous day). */
export function groupByDay<T extends { createdAt: string }>(items: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  let current: DayGroup<T> | null = null
  for (const item of items) {
    const d: Date = parse(item.createdAt) ?? current?.date ?? new Date(0)
    const key = localDayKey(d)
    if (!current || current.key !== key) {
      current = { key, date: d, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

/** "Áudio 0:12". */
export const audioLabel = (durationMs: number | null, { t }: Tr) => t('chat.preview.audio', { duration: formatDuration(durationMs ?? 0, 'round') })

export const conversationTitle = (conversation: Pick<ConversationSummary, 'kind' | 'name' | 'otherUser'>, { t }: Tr): string =>
  conversation.kind === 'group'
    ? conversation.name?.trim() || t('chat.conversation.untitledGroup')
    : conversation.otherUser?.displayName.trim() || t('chat.conversation.unknownUser')

export interface PreviewParts {
  /** "Tu" for my messages, the sender's name in groups, null otherwise. */
  sender: string | null
  audio: boolean
  /** Message text or "Áudio 0:12". */
  text: string
}

/** Pieces of a conversation row's last-message line. null when the conversation has no messages yet. */
export function lastMessageParts(
  last: LastMessagePreview | null,
  kind: ConversationSummary['kind'],
  meId: string | null,
  i18n: Tr,
): PreviewParts | null {
  if (!last) return null
  const audio = last.kind === 'audio'
  const text = audio ? audioLabel(last.audioDurationMs, i18n) : (last.preview ?? '')
  const sender = meId !== null && last.senderId === meId ? i18n.t('chat.preview.you') : kind === 'group' ? last.senderName?.trim() || i18n.t('chat.preview.someone') : null
  return { sender, audio, text }
}

/** Single-line text of a preview ("Tu: olá", "Ana: Áudio 0:12"). */
export const previewLine = (parts: PreviewParts, { t }: Tr): string =>
  parts.sender ? t('chat.preview.withSender', { name: parts.sender, text: parts.text }) : parts.text

/** Participants sorted for display: managers first, then by name. */
export function sortMembers<T extends PublicProfile & { memberRole: 'member' | 'manager' }>(members: readonly T[], locale: string): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return [...members].sort((a, b) =>
    a.memberRole === b.memberRole ? collator.compare(a.displayName, b.displayName) : a.memberRole === 'manager' ? -1 : 1,
  )
}

/** Accessible one-line description of a person in search results: "07 — Samuel Lopes — Monitor". */
export function personResultLabel(person: Pick<PublicProfile, 'publicId' | 'displayName' | 'role'>, { t }: Tr): string {
  let id = ''
  try {
    id = formatPublicIdNumber(person.publicId)
  } catch {
    // malformed number: leave the ID out
  }
  return t('chat.search.result', { id, name: person.displayName, role: t(`chat.roles.${person.role}`) })
}
