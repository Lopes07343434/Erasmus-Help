import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Mic, X } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { useChatNotifications, useChatSession, useConversations, useUnreadCounts } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { CHAT_PATH, conversationPath } from '../chatPaths'
import { ChatAvatar } from './ChatAvatar'
import { noticeText, shouldShowSystemNotification, showSystemNotification, toSystemNotification, updateAppBadge } from './systemNotifications'

const VISIBLE_MS = 6000

interface ShownNotice extends IncomingMessageNotice {
  key: number
}

/**
 * Mounted once by AppLayout: starts the chat session with the app (unread badge + notices work before Chat is
 * opened) and, for each incoming message outside the open conversation:
 *  - shows an in-app banner: groups "Grupo · {grupo}" + "{nome}: {mensagem}", direct "{nome}" + "{mensagem}", with
 *    the group / sender photo when the conversation list has it. Tap opens the conversation. Not shown on the Chat
 *    list itself (it updates live). Auto-hides after 6 s, paused while hovered or focused.
 *  - while the app is in the background, also a system notification (only with the browser permission granted and
 *    notifications enabled in the app), one per conversation.
 * Keeps the app icon badge in sync with the unread total where the Badging API exists.
 */
export function ChatNotificationsBridge({ activeConversationId }: { activeConversationId: string | null }) {
  const i18n = useI18n()
  const { t } = i18n
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)
  const seq = useRef(0)
  const [notice, setNotice] = useState<ShownNotice | null>(null)
  const [paused, setPaused] = useState(false)
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled)

  const session = useChatSession()
  const unreadTotal = useUnreadCounts().total
  const directs = useConversations('direct').items
  const groups = useConversations('group').items

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // Only once the list is known (not while connecting/offline): otherwise the badge would blink to 0 on every start.
  useEffect(() => {
    if (session.status === 'ready') updateAppBadge(unreadTotal)
  }, [session.status, unreadTotal])

  const onNotice = useCallback(
    (incoming: IncomingMessageNotice) => {
      if (shouldShowSystemNotification(notificationsEnabled)) {
        void showSystemNotification(toSystemNotification(incoming, i18n), (url) => void navigate(url))
      }
      if (pathnameRef.current === CHAT_PATH) return
      seq.current += 1
      setPaused(false)
      setNotice({ ...incoming, key: seq.current })
    },
    [notificationsEnabled, i18n, navigate],
  )

  useChatNotifications(onNotice, activeConversationId)

  // Opening that conversation (from anywhere) makes its banner pointless.
  if (notice && notice.conversationId === activeConversationId) setNotice(null)

  useEffect(() => {
    if (!notice || paused) return
    const id = setTimeout(() => setNotice(null), VISIBLE_MS)
    return () => clearTimeout(id)
  }, [notice, paused])

  const group = notice?.kind === 'group'
  const text = notice ? noticeText(notice, i18n) : ''
  const announcement = notice
    ? group
      ? t('chat.notifications.groupAnnouncement', { group: notice.title, name: notice.senderName, text })
      : t('chat.notifications.directAnnouncement', { name: notice.senderName, text })
    : ''
  const source = notice ? (group ? groups : directs).find((c) => c.id === notice.conversationId) : undefined
  const photo = (group ? source?.avatarPath : source?.otherUser?.avatarPath) ?? null

  const open = () => {
    if (!notice) return
    setPaused(false)
    setNotice(null)
    void navigate(conversationPath(notice.conversationId))
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)_+_8px)] z-(--z-toast) flex justify-center px-4 lg:left-(--eh-sidebar-w)">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {notice ? (
        <div
          key={notice.key}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="glass pointer-events-auto flex w-full max-w-[480px] animate-eh-fade items-center gap-1 rounded-card p-1.5 shadow-glass"
        >
          <button
            type="button"
            onClick={open}
            aria-label={announcement}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-tile border-0 bg-transparent p-2 text-left text-text transition-colors duration-150 hover:bg-primary-soft focus-visible:-outline-offset-2"
          >
            <ChatAvatar name={notice.senderName} group={group} photo={photo} size={40} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] leading-[1.3] font-semibold text-text3">
                {group ? t('chat.notifications.group', { group: notice.title }) : notice.senderName}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-sm leading-[1.35] font-medium">
                {group && notice.senderName ? <span className="shrink-0 font-semibold">{`${notice.senderName}:`}</span> : null}
                {notice.preview === null && notice.audioDurationMs !== null ? <Mic size={14} aria-hidden="true" className="shrink-0 text-primary" /> : null}
                <span className="line-clamp-2 min-w-0 break-words">{text}</span>
              </span>
            </span>
          </button>
          <IconButton
            variant="plain"
            icon={X}
            iconSize={18}
            aria-label={t('chat.notifications.dismiss')}
            onClick={() => {
              setPaused(false)
              setNotice(null)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
