import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock, listState, makeDirect, makeGroup, makeMe, notifications, readySession } from '../testFixtures'
import { ChatNotificationsBridge } from './ChatNotificationsBridge'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/chat/avatars', () => ({ avatarUrl: (path: string | null | undefined) => (path ? `https://cdn.test/${path}` : null) }))

function Probe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderBridge(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <ChatNotificationsBridge activeConversationId={null} />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const notify = (notice: IncomingMessageNotice) => act(() => notifications.onNotice?.(notice))

const GROUP_NOTICE: IncomingMessageNotice = { conversationId: 'g1', kind: 'group', title: 'Erasmus Milão', senderName: 'Ana', preview: 'Olá a todos', audioDurationMs: null }
const VOICE_NOTICE: IncomingMessageNotice = { conversationId: 'd1', kind: 'direct', title: 'João', senderName: 'João', preview: null, audioDurationMs: 12_000 }

/** Page-level Notification API stand-in: the permission is whatever the test says (never requested by the app). */
class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static shown: FakeNotification[] = []
  readonly title: string
  readonly options: NotificationOptions
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(title: string, options: NotificationOptions) {
    this.title = title
    this.options = options
    FakeNotification.shown.push(this)
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

function defineOnNavigator(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true })
}

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
  useSettingsStore.setState({ notificationsEnabled: true })
  FakeNotification.permission = 'granted'
  FakeNotification.shown = []
  vi.stubGlobal('Notification', FakeNotification)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'visibilityState')
  for (const name of ['serviceWorker', 'setAppBadge', 'clearAppBadge']) Reflect.deleteProperty(navigator, name)
})

describe('ChatNotificationsBridge', () => {
  it('labels group notices clearly and opens the conversation on tap', async () => {
    renderBridge('/')
    notify(GROUP_NOTICE)
    const banner = screen.getByRole('button', { name: 'Grupo · Erasmus Milão: Ana: Olá a todos' })
    expect(screen.getByText('Grupo · Erasmus Milão')).toBeInTheDocument()
    await userEvent.setup().click(banner)
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1')
    expect(screen.queryByRole('button', { name: /Grupo ·/ })).not.toBeInTheDocument()
  })

  it('direct notices read "{name}: {message}" and voice messages show their duration', async () => {
    renderBridge('/profile')
    notify(VOICE_NOTICE)
    expect(screen.getByRole('button', { name: 'João: Áudio 0:12' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar notificação' }))
    expect(screen.queryByRole('button', { name: 'João: Áudio 0:12' })).not.toBeInTheDocument()
  })

  it('shows the group or sender photo when the conversation list has it', () => {
    chatMock.set({
      lists: {
        group: listState([makeGroup({ id: 'g1', avatarPath: 'groups/g1/p.jpg' })]),
        direct: listState([makeDirect({ id: 'd1', otherUser: { id: 'u-j', publicId: 4, displayName: 'João', role: 'monitor', avatarPath: 'users/u-j/p.jpg' } })]),
      },
    })
    const { container } = renderBridge('/')
    notify(GROUP_NOTICE)
    expect(container.querySelector('img[src="https://cdn.test/groups/g1/p.jpg"]')).not.toBeNull()
    notify(VOICE_NOTICE)
    expect(container.querySelector('img[src="https://cdn.test/users/u-j/p.jpg"]')).not.toBeNull()
  })

  it('stays quiet on the Chat list (it updates live)', () => {
    renderBridge('/chat')
    notify({ conversationId: 'd1', kind: 'direct', title: 'João', senderName: 'João', preview: 'Olá', audioDurationMs: null })
    expect(screen.queryByRole('button', { name: 'João: Olá' })).not.toBeInTheDocument()
  })

  describe('system notifications', () => {
    it('in the background, with the permission granted and notifications enabled: one per conversation, click opens it', () => {
      const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined)
      setVisibility('hidden')
      renderBridge('/chat')
      notify(GROUP_NOTICE)
      notify(VOICE_NOTICE)

      expect(FakeNotification.shown.map((n) => [n.title, n.options])).toEqual([
        ['Grupo · Erasmus Milão', { body: 'Ana: Olá a todos', tag: 'g1', lang: 'pt-PT', icon: '/brand/pwa-192x192.png', data: { url: '/chat/g1' } }],
        ['João', { body: 'Áudio 0:12', tag: 'd1', lang: 'pt-PT', icon: '/brand/pwa-192x192.png', data: { url: '/chat/d1' } }],
      ])
      const [first] = FakeNotification.shown
      act(() => first?.onclick?.())
      expect(focus).toHaveBeenCalled()
      expect(first?.close).toHaveBeenCalled()
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1')
    })

    it.each([
      ['the app is visible', () => setVisibility('visible')],
      ['the permission is not granted', () => (setVisibility('hidden'), (FakeNotification.permission = 'default'))],
      ['the permission was denied', () => (setVisibility('hidden'), (FakeNotification.permission = 'denied'))],
      ['notifications are off in the app', () => (setVisibility('hidden'), useSettingsStore.setState({ notificationsEnabled: false }))],
    ])('none when %s', (_case, arrange) => {
      arrange()
      renderBridge('/')
      notify(GROUP_NOTICE)
      expect(FakeNotification.shown).toHaveLength(0)
      // The in-app banner still works.
      expect(screen.getByRole('button', { name: /Grupo · Erasmus Milão/ })).toBeInTheDocument()
    })

    it('goes through the service worker when there is one', async () => {
      const showNotification = vi.fn(() => Promise.resolve())
      defineOnNavigator('serviceWorker', { getRegistration: () => Promise.resolve({ showNotification }) })
      setVisibility('hidden')
      renderBridge('/')
      notify(GROUP_NOTICE)
      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith('Grupo · Erasmus Milão', expect.objectContaining({ tag: 'g1', data: { url: '/chat/g1' } })),
      )
      expect(FakeNotification.shown).toHaveLength(0)
    })

    it('opens the conversation when the service worker reports a notification click', async () => {
      const sw = Object.assign(new EventTarget(), { getRegistration: () => Promise.resolve(undefined) })
      defineOnNavigator('serviceWorker', sw)
      renderBridge('/')
      act(() => {
        sw.dispatchEvent(new MessageEvent('message', { data: { type: 'eh:open-url', url: 'https://evil.test/x' } }))
      })
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
      act(() => {
        sw.dispatchEvent(new MessageEvent('message', { data: { type: 'eh:open-url', url: '/chat/g1' } }))
      })
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1'))
    })
  })

  it('keeps the app icon badge in sync with the unread total once the chat is ready', () => {
    const setAppBadge = vi.fn(() => Promise.resolve())
    const clearAppBadge = vi.fn(() => Promise.resolve())
    defineOnNavigator('setAppBadge', setAppBadge)
    defineOnNavigator('clearAppBadge', clearAppBadge)
    chatMock.set({ unread: { total: 4, direct: 3, groups: 1 } })
    renderBridge('/')
    expect(setAppBadge).not.toHaveBeenCalled()

    act(() => chatMock.set({ session: readySession(makeMe()) }))
    expect(setAppBadge).toHaveBeenLastCalledWith(4)
    act(() => chatMock.set({ unread: { total: 0, direct: 0, groups: 0 } }))
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })
})
