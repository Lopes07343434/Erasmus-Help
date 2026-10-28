import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { chatMock } from '@/pages/chat/testFixtures'
import { AppError } from '@/services/errors'
import { usePushSyncStore } from '@/services/notifications/syncState'
import { useSettingsStore } from '@/stores/settingsStore'
import PermissionsPage from './PermissionsPage'

const mocks = vi.hoisted(() => ({
  pushConfigured: true,
  sendTestPush: vi.fn(async () => 1),
}))

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/notifications')>()),
  isPushConfigured: () => mocks.pushConfigured,
  sendTestPush: mocks.sendTestPush,
  unsubscribeFromPush: vi.fn(async () => true),
}))

function stubNotification(initial: NotificationPermission, answer: NotificationPermission = initial) {
  const state = { permission: initial }
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

function stubMicrophone(state: 'granted' | 'denied' | 'prompt', getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream)) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state, addEventListener: () => undefined, removeEventListener: () => undefined })) },
  })
  return getUserMedia
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/permissions']}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/settings/permissions" element={<PermissionsPage />} />
            <Route path="/settings" element={<p>settings-screen</p>} />
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
  chatMock.reset()
  mocks.pushConfigured = true
  mocks.sendTestPush.mockClear()
  usePushSyncStore.setState({ status: 'idle', attempt: 0 })
  useSettingsStore.setState({ appLanguage: 'pt-PT', notificationsEnabled: false })
  stubMicrophone('prompt')
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(navigator, 'permissions')
})

describe('PermissionsPage', () => {
  it('asks the browser for notifications only when the button is tapped', async () => {
    const requestPermission = stubNotification('default', 'granted')
    const user = userEvent.setup()
    renderPage()
    expect(requestPermission).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Ativar notificações' }))
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true)
    expect(screen.getByRole('switch', { name: /Notificações/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
  })

  it('shows how to re-enable notifications when they are blocked', () => {
    stubNotification('denied')
    renderPage()
    expect(screen.getByText('Notificações bloqueadas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
  })

  it('reports an unsupported browser instead of offering a button', () => {
    renderPage()
    expect(screen.getByRole('switch', { name: /Notificações/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
  })

  describe('push delivery', () => {
    beforeEach(() => {
      stubNotification('granted')
      useSettingsStore.setState({ notificationsEnabled: true })
    })

    it('says the device is registered and sends a real test notification', async () => {
      usePushSyncStore.setState({ status: 'registered' })
      const user = userEvent.setup()
      renderPage()
      expect(screen.getByText('Este dispositivo recebe notificações push, mesmo com a app fechada.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Enviar notificação de teste' }))
      expect(mocks.sendTestPush).toHaveBeenCalledTimes(1)
      expect(await screen.findByText('Enviada! Deve aparecer daqui a instantes.')).toBeInTheDocument()
    })

    it.each([
      ['rate-limited', 'Aguarda uns segundos antes de testar outra vez.'],
      ['not-found', 'Este dispositivo ainda não está registado. Tenta de novo dentro de instantes.'],
      ['unavailable', 'Não foi possível enviar o teste agora.'],
    ] as const)('explains a failed test (%s)', async (code, message) => {
      usePushSyncStore.setState({ status: 'registered' })
      mocks.sendTestPush.mockRejectedValueOnce(new AppError(code))
      const user = userEvent.setup()
      renderPage()
      await user.click(screen.getByRole('button', { name: 'Enviar notificação de teste' }))
      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('offers a retry when registering the device failed', async () => {
      usePushSyncStore.setState({ status: 'failed' })
      const user = userEvent.setup()
      renderPage()
      expect(screen.queryByRole('button', { name: 'Enviar notificação de teste' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
      expect(usePushSyncStore.getState().attempt).toBe(1)
    })

    it('does not pretend that push works when the build has no push configuration', () => {
      mocks.pushConfigured = false
      usePushSyncStore.setState({ status: 'registered' })
      renderPage()
      expect(screen.queryByRole('button', { name: 'Enviar notificação de teste' })).not.toBeInTheDocument()
      expect(screen.getByText('O envio de notificações ainda não está ativo nesta versão da app.')).toBeInTheDocument()
      expect(screen.queryByText('Receber com a app fechada')).not.toBeInTheDocument()
    })
  })

  describe('microphone', () => {
    it('asks the real permission on tap and shows the outcome', async () => {
      const getUserMedia = stubMicrophone('prompt')
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Permitir microfone' }))
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
      expect(await screen.findByText('O microfone está disponível.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Permitir microfone' })).not.toBeInTheDocument()
    })

    it('explains how to unblock a refused microphone', async () => {
      stubMicrophone('denied')
      renderPage()
      expect(await screen.findByText(/O microfone está bloqueado/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Permitir microfone' })).not.toBeInTheDocument()
    })
  })

  it('goes back to the settings', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Voltar às definições' }))
    expect(screen.getByText('settings-screen')).toBeInTheDocument()
  })
})
