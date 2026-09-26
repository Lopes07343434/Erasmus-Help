import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock, makeMe, readySession } from '@/pages/chat/testFixtures'
import SettingsPage from './SettingsPage'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

function stubNotification(answer: NotificationPermission) {
  const state = { permission: 'default' as NotificationPermission }
  const requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    state.permission = answer
    return answer
  })
  vi.stubGlobal(
    'Notification',
    class {
      static get permission() {
        return state.permission
      }
      static requestPermission = requestPermission
    },
  )
  return requestPermission
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })),
  )
  useSettingsStore.setState({ theme: 'system', appLanguage: 'pt-PT', conversationLanguage: 'it', notificationsEnabled: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsPage', () => {
  it('dark mode switch reflects the resolved theme and sets an explicit preference', async () => {
    const user = userEvent.setup()
    renderSettings()
    const dark = screen.getByRole('switch', { name: /Modo escuro/ })
    expect(dark).toHaveAttribute('aria-checked', 'false')
    await user.click(dark)
    expect(useSettingsStore.getState().theme).toBe('dark')
    expect(dark).toHaveAttribute('aria-checked', 'true')
  })

  it('turns notifications on only when the browser grants permission', async () => {
    const requestPermission = stubNotification('granted')
    const user = userEvent.setup()
    renderSettings()
    const row = screen.getByRole('switch', { name: /Notificações/ })
    await user.click(row)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Notificações ativadas')).toBeInTheDocument()
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true)
    expect(row).toHaveAttribute('aria-checked', 'true')

    await user.click(row)
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false)
    expect(row).toHaveAttribute('aria-checked', 'false')
  })

  it('stays off and explains how to re-enable when the permission is denied', async () => {
    stubNotification('denied')
    const user = userEvent.setup()
    renderSettings()
    const row = screen.getByRole('switch', { name: /Notificações/ })
    await user.click(row)
    expect(await screen.findByText('As notificações estão bloqueadas no browser.')).toBeInTheDocument()
    expect(row).toHaveAttribute('aria-checked', 'false')
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false)
    expect(screen.getByText('Notificações bloqueadas')).toBeInTheDocument()
  })

  it('links to the chat administration for admins only', () => {
    const { unmount } = renderSettings()
    expect(screen.queryByRole('link', { name: /Gerir utilizadores do chat/ })).not.toBeInTheDocument()
    unmount()
    chatMock.set({ session: readySession(makeMe({ role: 'admin' })) })
    renderSettings()
    expect(screen.getByRole('link', { name: /Gerir utilizadores do chat/ })).toHaveAttribute('href', '/admin')
  })

  it('changes the conversation language from its sheet', async () => {
    const user = userEvent.setup()
    renderSettings()
    await user.click(screen.getByRole('button', { name: /Idioma de conversa/ }))
    await user.click(screen.getByRole('option', { name: /Alemão/ }))
    expect(useSettingsStore.getState().conversationLanguage).toBe('de')
    expect(useSettingsStore.getState().appLanguage).toBe('pt-PT')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
