import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { clearGeocodingMemo } from '@/services/geo'
import { jsonResponse } from '@/services/weather/testUtils'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import OnboardingPage from './OnboardingPage'

/** Stand-in for the browser Notification API; the prompt's answer is decided per test. */
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

const MILANO = {
  id: 3173435,
  name: 'Milano',
  latitude: 45.46427,
  longitude: 9.18951,
  country_code: 'IT',
  feature_code: 'PPLA',
  admin1: 'Lombardia',
  timezone: 'Europe/Rome',
  population: 1371498,
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/" element={<p>home-screen</p>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

async function skipToSetup(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Erasmus Help. Toca para continuar.' }))
  await user.click(await screen.findByRole('button', { name: 'Saltar introdução' }))
  await screen.findByRole('heading', { level: 1, name: 'Qual é o teu nome?' })
}

const continueButton = () => screen.getByRole('button', { name: 'Continuar' })

async function answerNameAndRole(user: UserEvent) {
  await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Ana Silva')
  await user.click(continueButton())
  await screen.findByRole('heading', { level: 1, name: 'Qual é a tua função?' })
  await user.click(screen.getByRole('radio', { name: /Aluno/ }))
  await user.click(continueButton())
  await screen.findByRole('heading', { level: 1, name: 'Qual é a tua língua?' })
}

beforeAll(async () => {
  await Promise.all([loadMessages('pt-PT'), loadMessages('en')])
})

beforeEach(() => {
  localStorage.clear()
  clearGeocodingMemo()
  useProfileStore.getState().reset()
  useSettingsStore.setState({ theme: 'system', appLanguage: 'pt-PT', conversationLanguage: 'en', notificationsEnabled: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OnboardingPage', () => {
  it('validates the name: continue stays disabled and the error is shown until the name is valid', async () => {
    const user = userEvent.setup()
    renderAt('/welcome')
    await skipToSetup(user)

    const input = screen.getByRole('textbox', { name: 'Nome' })
    expect(input).toHaveFocus()
    expect(continueButton()).toBeDisabled()
    expect(screen.getByRole('img', { name: 'Passo 1 de 5' })).toBeInTheDocument()

    await user.type(input, '42')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('Usa só letras, espaços, apóstrofos, pontos ou hífenes.').length).toBeGreaterThan(0)
    expect(continueButton()).toBeDisabled()

    await user.clear(input)
    expect(screen.getAllByText('Escreve o teu nome.').length).toBeGreaterThan(0)

    await user.type(input, 'Ana{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é a tua função?' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    // Nothing is persisted before the end.
    expect(useProfileStore.getState().name).toBe('')
  })

  it('switches the whole UI when the language is chosen', async () => {
    const user = userEvent.setup()
    renderAt('/welcome')
    await skipToSetup(user)
    await answerNameAndRole(user)

    expect(continueButton()).toBeDisabled()
    const english = screen.getByRole('radio', { name: /English/ })
    await user.click(english)

    expect(useSettingsStore.getState().appLanguage).toBe('en')
    expect(english).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByRole('heading', { level: 1, name: 'What’s your main language?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    // "Meu idioma" is only written when the onboarding finishes.
    expect(useProfileStore.getState().myLanguage).toBeNull()
  })

  it('asks the real notification permission and, on finish, writes both stores and goes home', async () => {
    const requestPermission = stubNotification('granted')
    const fetchMock = vi.fn(async () => jsonResponse({ results: [MILANO] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderAt('/welcome')
    await skipToSetup(user)
    await answerNameAndRole(user)

    await user.click(screen.getByRole('radio', { name: /Português/ }))
    await user.click(continueButton())
    await screen.findByRole('heading', { level: 1, name: 'Onde vais estar?' })

    expect(screen.getByRole('textbox', { name: 'Cidade' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /País/ }))
    await user.click(await screen.findByRole('option', { name: 'Itália' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /País/ })).toHaveAccessibleName('País Itália')
    // The city field is remounted for the new country.
    const city = screen.getByRole('textbox', { name: 'Cidade' })
    expect(city).toBeEnabled()
    expect(continueButton()).toBeDisabled()

    await user.type(city, 'Mil')
    await user.click(await screen.findByRole('option', { name: /Milano/ }))
    expect(fetchMock).toHaveBeenCalled()
    expect(screen.getByText('Cidade escolhida: Milano, Lombardia')).toBeInTheDocument()
    await user.click(continueButton())

    await screen.findByRole('heading', { level: 1, name: 'Queres receber notificações?' })
    expect(screen.queryByRole('button', { name: 'Começar' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Permitir notificações' }))
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Notificações ativadas')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Começar' }))
    expect(await screen.findByText('home-screen')).toBeInTheDocument()

    const profile = useProfileStore.getState()
    expect(profile).toMatchObject({ name: 'Ana Silva', role: 'student', myLanguage: 'pt-PT' })
    expect(profile.location).toMatchObject({
      countryCode: 'IT',
      city: { name: 'Milano', latitude: 45.46427, longitude: 9.18951, timezone: 'Europe/Rome', admin1: 'Lombardia' },
    })
    expect(profile.onboardingCompletedAt).not.toBeNull()
    expect(useSettingsStore.getState()).toMatchObject({ appLanguage: 'pt-PT', conversationLanguage: 'it', notificationsEnabled: true })
  })

  it('shows the denied outcome with re-enable help and keeps notifications off', async () => {
    stubNotification('denied')
    const user = userEvent.setup()
    renderAt('/welcome')
    await skipToSetup(user)
    await answerNameAndRole(user)
    await user.click(screen.getByRole('radio', { name: /Português/ }))
    await user.click(continueButton())

    // Offline geocoding: the typed city can still be used (saved without coordinates).
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: /País/ }))
    await user.click(await screen.findByRole('option', { name: 'Polónia' }))
    await user.type(screen.getByRole('textbox', { name: 'Cidade' }), 'Kraków')
    await user.click(await screen.findByRole('button', { name: 'Usar «Kraków»' }))
    await user.click(continueButton())

    await user.click(await screen.findByRole('button', { name: 'Permitir notificações' }))
    expect(await screen.findByText('Notificações bloqueadas')).toBeInTheDocument()
    expect(screen.getByText('Como voltar a ativar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Começar' }))
    await screen.findByText('home-screen')
    expect(useProfileStore.getState().location).toEqual({
      countryCode: 'PL',
      city: { name: 'Kraków', latitude: undefined, longitude: undefined, timezone: undefined, admin1: undefined },
    })
    expect(useSettingsStore.getState()).toMatchObject({ notificationsEnabled: false, conversationLanguage: 'pl' })
  })

  it('replays only the intro when already onboarded (?intro=1) and returns home', async () => {
    useProfileStore.setState({ name: 'Ana', onboardingCompletedAt: '2026-09-25T10:00:00.000Z' })
    const user = userEvent.setup()
    renderAt('/welcome?intro=1')

    expect(screen.queryByRole('button', { name: 'Erasmus Help. Toca para continuar.' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Boas-vindas à Erasmus Help' })).toBeInTheDocument()
    await user.click(continueButton())
    await user.click(continueButton())
    expect(screen.queryByRole('button', { name: 'Saltar introdução' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Começar' }))
    expect(await screen.findByText('home-screen')).toBeInTheDocument()
  })
})
