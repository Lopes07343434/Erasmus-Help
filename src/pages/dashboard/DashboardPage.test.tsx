import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { renderUi, setupUiTests } from '@/components/ui/testUtils'
import type { UseWeatherResult } from '@/hooks/useWeather'
import { loadMessages } from '@/i18n/catalog'
import type { UiLocale } from '@/i18n/languages'
import { AppError } from '@/services/errors'
import type { WeatherSnapshot } from '@/services/weather'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { UserLocation } from '@/types/profile'
import DashboardPage from './DashboardPage'
import { capitalizeFirst, firstName, languageNameInSentence } from './dashboardText'

const mocked = vi.hoisted(() => ({
  weather: { status: 'empty', isRefreshing: false, refresh: () => {} } as UseWeatherResult,
  calls: [] as unknown[],
}))

vi.mock('@/hooks/useWeather', () => ({
  useWeather: (location: unknown) => {
    mocked.calls.push(location)
    return mocked.weather
  },
}))

setupUiTests()

const MILAN: UserLocation = { countryCode: 'IT', city: { name: 'Milão', latitude: 45.46, longitude: 9.19 } }

const snapshot = (over: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  provider: 'open-meteo',
  latitude: 45.46,
  longitude: 9.19,
  timezone: 'Europe/Rome',
  fetchedAt: Date.now(),
  temperature: 18.4,
  apparentTemperature: 17.2,
  min: 12.1,
  max: 21.6,
  precipitationProbability: 35,
  weatherCode: 2,
  condition: 'partlyCloudy',
  isDay: true,
  feel: 'cool',
  ...over,
})

function setWeather(result: Partial<UseWeatherResult> & Pick<UseWeatherResult, 'status'>) {
  mocked.weather = { isRefreshing: false, refresh: vi.fn(), ...result }
  return mocked.weather
}

function renderPage() {
  return renderUi(
    <ToastProvider>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<p>Página de perfil</p>} />
      </Routes>
    </ToastProvider>,
  )
}

const weatherCard = () => screen.getByRole('region', { name: 'Localização e meteorologia' })

beforeAll(async () => {
  await Promise.all([loadMessages('en'), loadMessages('pl')])
})

beforeEach(() => {
  mocked.calls = []
  useSettingsStore.setState({ appLanguage: 'pt-PT', conversationLanguage: 'en', notificationsEnabled: false })
  useProfileStore.setState({ name: 'Ana Maria Silva', location: MILAN })
  setWeather({ status: 'success', data: { ...snapshot(), stale: false } })
})

afterEach(() => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
})

describe('dashboard text helpers', () => {
  it('extracts the first name and capitalises the date', () => {
    expect(firstName('  Ana   Maria Silva ')).toBe('Ana')
    expect(firstName('')).toBe('')
    expect(capitalizeFirst('quinta-feira, 25 de setembro', 'pt-PT')).toBe('Quinta-feira, 25 de setembro')
    expect(capitalizeFirst('czwartek, 25 września', 'pl')).toBe('Czwartek, 25 września')
  })

  it('lower-cases language names mid-sentence except in English', () => {
    expect(languageNameInSentence('Inglês', 'pt-PT')).toBe('inglês')
    expect(languageNameInSentence('Angielski', 'pl')).toBe('angielski')
    expect(languageNameInSentence('English', 'en')).toBe('English')
  })
})

describe('DashboardPage — header', () => {
  it('greets the user by first name in the h1 and shows a capitalised date', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Olá, Ana' })).toBeInTheDocument()
    const date = document.querySelector('time')
    expect(date?.textContent?.charAt(0)).toMatch(/\p{Lu}/u)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['O que precisas agora?', 'Ações rápidas'])
  })

  it('bell shows a toast depending on the notification preference (no fake badge)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(screen.getByRole('status')).toHaveTextContent('As notificações estão desativadas')

    useSettingsStore.setState({ notificationsEnabled: true })
    await user.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sem novas notificações')
  })

  it('avatar shows the initials and opens the profile', async () => {
    const user = userEvent.setup()
    renderPage()
    const avatar = screen.getByRole('button', { name: 'Perfil' })
    expect(avatar).toHaveTextContent('AS')
    await user.click(avatar)
    expect(screen.getByText('Página de perfil')).toBeInTheDocument()
  })
})

describe('DashboardPage — location & weather card', () => {
  it('success: place, condition · feel, temperature, details and attribution', () => {
    renderPage()
    expect(mocked.calls.at(-1)).toEqual(MILAN)
    const card = weatherCard()
    expect(within(card).getByText('Milão, Itália')).toBeInTheDocument()
    expect(within(card).getByText('Parcialmente nublado · Fresco')).toBeInTheDocument()
    expect(within(card).getByText('18°')).toBeInTheDocument()
    expect(within(card).getByText('Mín. / Máx.')).toBeInTheDocument()
    expect(within(card).getByText('12° / 22°')).toBeInTheDocument()
    expect(within(card).getByText('Chuva')).toBeInTheDocument()
    expect(within(card).getByText('35%')).toBeInTheDocument()
    expect(within(card).queryByText(/Dados meteorológicos de/)).not.toBeInTheDocument()

    const attribution = screen.getByRole('link', { name: /Open-Meteo\.com/ })
    expect(attribution).toHaveAttribute('href', 'https://open-meteo.com/')
    expect(attribution).toHaveAttribute('target', '_blank')
    expect(attribution).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hides values the provider did not return', () => {
    setWeather({ status: 'success', data: { ...snapshot({ condition: null, min: null, precipitationProbability: null }), stale: false } })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('Fresco')).toBeInTheDocument()
    expect(within(card).getByText('Máx.')).toBeInTheDocument()
    expect(within(card).getByText('22°')).toBeInTheDocument()
    expect(within(card).queryByText('Chuva')).not.toBeInTheDocument()
    expect(within(card).queryByText(/Mín\./)).not.toBeInTheDocument()
  })

  it('hides the detail grid when min, max and rain are all missing', () => {
    setWeather({ status: 'success', data: { ...snapshot({ min: null, max: null, precipitationProbability: null }), stale: false } })
    renderPage()
    expect(weatherCard().querySelector('dl')).toBeNull()
  })

  it('loading: skeleton in the same card, busy, with the place already known', () => {
    setWeather({ status: 'loading', isRefreshing: true })
    renderPage()
    const card = weatherCard()
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).getByText('Milão, Itália')).toBeInTheDocument()
    expect(within(card).getByText('A carregar a meteorologia…')).toBeInTheDocument()
    expect(within(card).queryByText(/°/)).not.toBeInTheDocument()
  })

  it('empty: no location → message and link to the profile', () => {
    useProfileStore.setState({ location: null })
    setWeather({ status: 'empty' })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('Sem localização definida')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Definir localização' })).toHaveAttribute('href', '/profile')
    expect(screen.queryByRole('link', { name: /Open-Meteo/ })).not.toBeInTheDocument()
  })

  it('stale data while revalidating: keeps the values and shows the data age', () => {
    setWeather({ status: 'success', isRefreshing: true, data: { ...snapshot({ fetchedAt: Date.now() - 2 * 3_600_000 }), stale: true } })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('18°')).toBeInTheDocument()
    expect(within(card).getByText(/Dados meteorológicos de há 2 horas/)).toBeInTheDocument()
    expect(within(card).getByRole('status')).toHaveTextContent('A atualizar a meteorologia…')
  })

  it('offline with cached data: keeps the values, shows the age and allows a retry', async () => {
    const user = userEvent.setup()
    const result = setWeather({
      status: 'offline',
      error: new AppError('offline'),
      data: { ...snapshot({ fetchedAt: Date.now() - 45 * 60_000 }), stale: true },
    })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('18°')).toBeInTheDocument()
    expect(within(card).getByText(/há 45 minutos/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Tentar novamente' }))
    expect(result.refresh).toHaveBeenCalledTimes(1)
  })

  it('error without data: compact localized error with retry', async () => {
    const user = userEvent.setup()
    const result = setWeather({ status: 'error', error: new AppError('unavailable') })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('Meteorologia indisponível')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Tentar novamente' }))
    expect(result.refresh).toHaveBeenCalledTimes(1)
  })

  it('error codes without a weather text use the errors namespace', () => {
    setWeather({ status: 'error', error: new AppError('timeout') })
    renderPage()
    expect(within(weatherCard()).getByText('Está a demorar demasiado')).toBeInTheDocument()
  })

  it('offline without data: offline message', () => {
    setWeather({ status: 'offline', error: new AppError('offline') })
    renderPage()
    expect(within(weatherCard()).getByText('Sem ligação')).toBeInTheDocument()
  })

  it('city not found: points to the profile instead of retrying', () => {
    setWeather({ status: 'error', error: new AppError('not-found') })
    renderPage()
    const card = weatherCard()
    expect(within(card).getByText('Cidade não encontrada')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Abrir perfil' })).toHaveAttribute('href', '/profile')
    expect(within(card).queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  })
})

describe('DashboardPage — features', () => {
  it.each<[UiLocale, string]>([
    ['pt-PT', 'Pratica inglês em voz alta'],
    ['en', 'Practise English out loud'],
    ['pl', 'Ćwicz angielski na głos'],
  ])('hero uses the conversation language name with the right casing (%s)', (locale, title) => {
    useSettingsStore.setState({ appLanguage: locale })
    renderPage()
    expect(screen.getByText(title)).toBeInTheDocument()
  })

  it('links go to the real routes', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Pratica inglês em voz alta/ })).toHaveAttribute('href', '/talk?mode=train')
    expect(screen.getByRole('link', { name: /Fala e ouve a tradução/ })).toHaveAttribute('href', '/translate')
    expect(screen.getByRole('link', { name: /Tradução frente a frente/ })).toHaveAttribute('href', '/talk?mode=person')
    expect(screen.getByRole('link', { name: 'Treinar' })).toHaveAttribute('href', '/talk?mode=train')
    expect(screen.getByRole('link', { name: 'Definições' })).toHaveAttribute('href', '/settings')
  })

  it('emergency opens a sheet with a real tel:112 link', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Emergência' }))
    const dialog = screen.getByRole('dialog', { name: 'Emergência' })
    expect(within(dialog).getByText(/o número geral de emergência é o 112/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Ligar 112' })).toHaveAttribute('href', 'tel:112')
  })

  it('emergency numbers follow the country the user lives in', async () => {
    useProfileStore.setState({ location: { countryCode: 'PL', city: { name: 'Kraków' } } })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Emergência' }))
    const dialog = screen.getByRole('dialog', { name: 'Emergência' })
    expect(within(dialog).getByText(/o número geral de emergência é o 112/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Ligar 112' })).toHaveAttribute('href', 'tel:112')
    expect(within(dialog).getByRole('link', { name: /Ambulância.*999/ })).toHaveAttribute('href', 'tel:999')
    expect(within(dialog).getByRole('link', { name: /Polícia.*997/ })).toHaveAttribute('href', 'tel:997')
  })

  it('in the UK the main emergency number is 999', async () => {
    useProfileStore.setState({ location: { countryCode: 'GB', city: { name: 'London' } } })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Emergência' }))
    const dialog = screen.getByRole('dialog', { name: 'Emergência' })
    expect(within(dialog).getByRole('link', { name: 'Ligar 999' })).toHaveAttribute('href', 'tel:999')
    expect(within(dialog).getByText(/O 112 também funciona/)).toBeInTheDocument()
  })
})
