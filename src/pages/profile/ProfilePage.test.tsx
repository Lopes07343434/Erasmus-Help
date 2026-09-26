import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock, makeMe, readySession } from '@/pages/chat/testFixtures'
import ProfilePage from './ProfilePage'

const mocks = vi.hoisted(() => ({
  unsubscribeFromPush: vi.fn(() => Promise.resolve(true)),
  clearWeatherCache: vi.fn(),
  signOutChat: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/chat', () => ({ signOutChat: mocks.signOutChat }))

vi.mock('@/services/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/notifications')>()),
  unsubscribeFromPush: mocks.unsubscribeFromPush,
}))
vi.mock('@/services/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/weather')>()),
  clearWeatherCache: mocks.clearWeatherCache,
}))

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/welcome" element={<p>welcome-screen</p>} />
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
  localStorage.clear()
  useSettingsStore.setState({ theme: 'dark', appLanguage: 'pt-PT', conversationLanguage: 'it', notificationsEnabled: true })
  const profile = useProfileStore.getState()
  profile.reset()
  profile.setName('Ana Silva')
  profile.setRole('student')
  profile.setMyLanguage('pt-PT')
  profile.setLocation({ countryCode: 'IT', city: { name: 'Milano', latitude: 45.46, longitude: 9.19 } })
  profile.completeOnboarding()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProfilePage', () => {
  it('shows the identity card from the profile store', () => {
    renderProfile()
    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument()
    expect(screen.getByText('AS')).toBeInTheDocument()
    expect(screen.getAllByText('Ana Silva').length).toBeGreaterThan(0)
    expect(screen.getByText('Milano, Itália')).toBeInTheDocument()
  })

  it('edits the name through the sheet', async () => {
    const user = userEvent.setup()
    renderProfile()
    await user.click(screen.getByRole('button', { name: /^Nome/ }))
    const dialog = screen.getByRole('dialog', { name: 'O teu nome' })
    const input = within(dialog).getByRole('textbox', { name: 'Nome' })
    expect(input).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'Ana Costa{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useProfileStore.getState().name).toBe('Ana Costa')
    expect(screen.getByText('Alterações guardadas')).toBeInTheDocument()
  })

  it('deletes this device’s data after confirmation and restarts at /welcome', async () => {
    const user = userEvent.setup()
    renderProfile()
    expect(localStorage.getItem('eh:profile')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Apagar dados deste dispositivo' }))
    const dialog = screen.getByRole('dialog', { name: 'Apagar os dados deste dispositivo?' })
    // Cancel keeps everything.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(useProfileStore.getState().name).toBe('Ana Silva')

    await user.click(screen.getByRole('button', { name: 'Apagar dados deste dispositivo' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar dados' }))

    expect(await screen.findByText('welcome-screen')).toBeInTheDocument()
    expect(useProfileStore.getState()).toMatchObject({ name: '', role: null, myLanguage: null, location: null, onboardingCompletedAt: null })
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'system', conversationLanguage: 'en', notificationsEnabled: false })
    expect(localStorage.getItem('eh:profile')).toBeNull()
    expect(localStorage.getItem('eh:settings')).toBeNull()
    expect(mocks.unsubscribeFromPush).toHaveBeenCalledTimes(1)
    expect(mocks.clearWeatherCache).toHaveBeenCalledTimes(1)
    expect(mocks.signOutChat).toHaveBeenCalledTimes(1)
  })

  it('shows the public chat ID with a copy action once the chat is ready', async () => {
    const user = userEvent.setup() // installs a clipboard stub
    const { unmount } = renderProfile()
    // Not configured / connecting: no ID row.
    expect(screen.queryByRole('button', { name: /Copiar o teu ID/ })).not.toBeInTheDocument()
    unmount()

    chatMock.set({ session: readySession(makeMe({ publicId: 7 })) })
    renderProfile()
    const row = screen.getByRole('button', { name: 'Copiar o teu ID (ID 07)' })
    expect(screen.getByRole('heading', { level: 2, name: 'O teu ID' })).toBeInTheDocument()
    expect(row).toHaveTextContent('ID 07')
    expect(row).toHaveTextContent('Copiar ID')
    await user.click(row)
    expect(await navigator.clipboard.readText()).toBe('ID 07')
    expect(await screen.findByText('ID copiado')).toBeInTheDocument()
  })
})
