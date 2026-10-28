import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useSettingsStore } from '@/stores/settingsStore'
import PwaNotices from './PwaNotices'

const mocks = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'desktop' | 'other',
  permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  needRefresh: false,
  pushConfigured: true,
}))

vi.mock('@/pwa', () => ({
  useServiceWorker: () => ({ needRefresh: mocks.needRefresh, offlineReady: false, update: vi.fn(), dismiss: vi.fn() }),
  useInstallPrompt: () => ({ platform: mocks.platform }),
  useNotificationPermission: () => ({ permission: mocks.permission }),
}))
vi.mock('@/services/notifications', () => ({ isPushConfigured: () => mocks.pushConfigured }))

function renderNotices() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<PwaNotices />} />
            <Route path="/settings/permissions" element={<p>permissions-screen</p>} />
          </Routes>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await loadMessages('pt-PT')
})

beforeEach(() => {
  Object.assign(mocks, { platform: 'android', permission: 'default', needRefresh: false, pushConfigured: true })
  useSettingsStore.setState({ appLanguage: 'pt-PT', pushAnnouncementSeen: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('push announcement (in-app)', () => {
  it('invites Android users who were not asked yet and opens the permissions screen, once', async () => {
    const user = userEvent.setup()
    renderNotices()
    expect(screen.getByText('Notificações push já disponíveis')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver permissões' }))
    expect(screen.getByText('permissions-screen')).toBeInTheDocument()
    expect(useSettingsStore.getState().pushAnnouncementSeen).toBe(true)
  })

  it('can be closed and then never comes back', async () => {
    const user = userEvent.setup()
    const { unmount } = renderNotices()
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('Notificações push já disponíveis')).not.toBeInTheDocument()
    unmount()
    renderNotices()
    expect(screen.queryByText('Notificações push já disponíveis')).not.toBeInTheDocument()
  })

  it.each([
    ['not on Android', () => { mocks.platform = 'ios' }],
    ['notifications are already allowed', () => { mocks.permission = 'granted' }],
    ['notifications were refused', () => { mocks.permission = 'denied' }],
    ['the build cannot deliver push', () => { mocks.pushConfigured = false }],
    ['an app update is waiting', () => { mocks.needRefresh = true }],
  ])('is not shown when %s', (_name, arrange) => {
    arrange()
    renderNotices()
    expect(screen.queryByText('Notificações push já disponíveis')).not.toBeInTheDocument()
  })
})
