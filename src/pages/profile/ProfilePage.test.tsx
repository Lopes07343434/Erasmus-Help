import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useProfileStore } from '@/stores/profileStore'
import { AppError } from '@/services/errors'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock, makeMe, profileActions, readySession } from '@/pages/chat/testFixtures'
import ProfilePage from './ProfilePage'

const mocks = vi.hoisted(() => ({
  unsubscribeFromPush: vi.fn(() => Promise.resolve(true)),
  clearWeatherCache: vi.fn(),
  signOutChat: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/chat', () => ({ signOutChat: mocks.signOutChat }))
vi.mock('@/services/chat/avatars', () => ({ avatarUrl: (path: string | null | undefined) => (path ? `https://cdn.test/${path}` : null) }))

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
    const clearAppBadge = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clearAppBadge', { value: clearAppBadge, configurable: true })
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'clearAppBadge')
    })
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
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('without chat in this build: no ID and no photo action on the card', () => {
    renderProfile()
    expect(screen.queryByRole('button', { name: /Copiar o teu ID/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /foto/i })).not.toBeInTheDocument()
    expect(screen.getByText('Aluno', { selector: 'p' })).toBeInTheDocument()
  })

  it('the card shows photo, name, type (from the chat account) and the ID with "Copiar ID"', async () => {
    const user = userEvent.setup() // installs a clipboard stub
    chatMock.set({ session: readySession(makeMe({ publicId: 15, role: 'monitor', avatarPath: 'users/u-me/a.jpg' })) })
    const { container } = renderProfile()
    expect(container.querySelector('img[src="https://cdn.test/users/u-me/a.jpg"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Mudar foto' })).toBeInTheDocument()
    expect(screen.getAllByText('Monitor').length).toBeGreaterThan(0)
    // The separate "O teu ID" section is gone: the card carries it.
    expect(screen.queryByRole('heading', { level: 2, name: 'O teu ID' })).not.toBeInTheDocument()

    const copy = screen.getByRole('button', { name: 'Copiar o teu ID (ID: 15)' })
    expect(copy).toHaveTextContent('ID: 15')
    expect(copy).toHaveTextContent('Copiar ID')
    await user.click(copy)
    expect(await navigator.clipboard.readText()).toBe('ID: 15')
    expect(await screen.findByText('ID copiado')).toBeInTheDocument()
  })

  it('choosing a picture saves it as the profile photo', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe()) })
    renderProfile()
    await user.click(screen.getByRole('button', { name: 'Adicionar foto' }))
    const sheet = screen.getByRole('dialog', { name: 'Foto de perfil' })
    expect(within(sheet).queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Escolher foto' })).toBeEnabled()

    const file = new File(['png'], 'eu.png', { type: 'image/png' })
    await user.upload(sheet.querySelector('input[type="file"]') as HTMLInputElement, file)
    expect(profileActions.setMyAvatar).toHaveBeenCalledWith(file)
    expect(await screen.findByText('Foto de perfil atualizada')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('an unusable picture is explained and nothing is saved', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe()) })
    profileActions.setMyAvatar.mockRejectedValueOnce(new AppError('invalid-input'))
    renderProfile()
    await user.click(screen.getByRole('button', { name: 'Adicionar foto' }))
    const sheet = screen.getByRole('dialog', { name: 'Foto de perfil' })
    await user.upload(sheet.querySelector('input[type="file"]') as HTMLInputElement, new File(['?'], 'x.png', { type: 'image/png' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Não foi possível usar esta imagem. Escolhe uma foto em JPG, PNG ou WebP.')
    expect(within(sheet).getByRole('button', { name: 'Escolher foto' })).toBeEnabled()
  })

  it('removes the current photo', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe({ avatarPath: 'users/u-me/a.jpg' })) })
    renderProfile()
    await user.click(screen.getByRole('button', { name: 'Mudar foto' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Foto de perfil' })).getByRole('button', { name: 'Remover foto' }))
    expect(profileActions.setMyAvatar).toHaveBeenCalledWith(null)
    expect(await screen.findByText('Foto de perfil removida')).toBeInTheDocument()
  })

  it('the photo cannot be changed until the chat is connected', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: { status: 'connecting', me: null, error: null, retry: vi.fn() } })
    renderProfile()
    await user.click(screen.getByRole('button', { name: 'Adicionar foto' }))
    const sheet = screen.getByRole('dialog', { name: 'Foto de perfil' })
    expect(within(sheet).getByText('Podes adicionar uma foto quando o chat estiver ligado.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Escolher foto' })).toBeDisabled()
  })
})
