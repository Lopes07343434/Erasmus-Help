/**
 * System (OS) notifications for chat messages that arrive while the app is in the background, and the app icon badge.
 * Nothing here asks for permission or pretends to have it: a notification is only shown when the browser itself
 * reports Notification.permission === 'granted' (asked in onboarding / Definições) and the user left notifications
 * enabled in the app.
 */
import type { I18nValue } from '@/i18n/I18nProvider'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { getNotificationPermission } from '@/services/notifications'
import { audioLabel } from '../chatFormat'
import { conversationPath } from '../chatPaths'

export const NOTIFICATION_ICON = '/brand/pwa-192x192.png'

export interface SystemNotification {
  title: string
  body: string
  /** One notification per conversation: a newer message replaces the previous one. */
  tag: string
  /** App path opened when the notification is clicked. */
  url: string
  lang: string
}

type Tr = Pick<I18nValue, 't' | 'locale'>

/** Message line of a notice: the text, or "Áudio 0:12" for a voice message. */
export function noticeText(notice: IncomingMessageNotice, i18n: Pick<I18nValue, 't'>): string {
  return notice.preview === null && notice.audioDurationMs !== null ? audioLabel(notice.audioDurationMs, i18n) : (notice.preview ?? '')
}

/** Groups: "Grupo · {grupo}" + "{nome}: {mensagem}". Direct chats: "{nome}" + "{mensagem}". */
export function toSystemNotification(notice: IncomingMessageNotice, i18n: Tr): SystemNotification {
  const { t } = i18n
  const text = noticeText(notice, i18n)
  const group = notice.kind === 'group'
  return {
    title: group ? t('chat.notifications.group', { group: notice.title }) : notice.senderName || notice.title,
    body: group && notice.senderName ? t('chat.preview.withSender', { name: notice.senderName, text }) : text,
    tag: notice.conversationId,
    url: conversationPath(notice.conversationId),
    lang: i18n.locale,
  }
}

/** The page is in the background, the browser granted the permission and the user enabled notifications in the app. */
export function shouldShowSystemNotification(enabledInApp: boolean): boolean {
  return enabledInApp && typeof document !== 'undefined' && document.visibilityState === 'hidden' && getNotificationPermission() === 'granted'
}

/**
 * Shows it through the service worker when one is registered (the only way on Android; the worker opens `data.url` on
 * click), otherwise with the page-level constructor, whose click focuses this window and calls `onOpen(url)`.
 * Failures are swallowed: a missed system notification must never break the chat.
 */
export async function showSystemNotification(notification: SystemNotification, onOpen: (url: string) => void): Promise<void> {
  const { title, body, tag, url, lang } = notification
  const options: NotificationOptions = { body, tag, lang, icon: NOTIFICATION_ICON, data: { url } }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(title, options)
      return
    }
  } catch {
    // No usable service worker: fall back to a page-level notification.
  }
  try {
    const shown = new Notification(title, options)
    shown.onclick = () => {
      window.focus()
      onOpen(url)
      shown.close()
    }
  } catch {
    // e.g. Chrome on Android only allows notifications from a service worker.
  }
}

/** App icon badge (installed PWA) with the unread total; 0 clears it. No-op where the Badging API is missing. */
export function updateAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return
  try {
    if (count > 0) {
      if ('setAppBadge' in navigator) navigator.setAppBadge(count).catch(() => undefined)
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => undefined)
    }
  } catch {
    // Some engines throw synchronously (e.g. not installed / not allowed): the badge is best effort.
  }
}
