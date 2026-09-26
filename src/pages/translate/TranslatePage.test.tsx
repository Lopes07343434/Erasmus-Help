import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceTranslationResult, VoiceTranslationState } from '@/hooks/useVoiceTranslation'
import { AppError } from '@/services/errors'
import type { MicrophonePermission } from '@/services/speech'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { renderUi, setupUiTests } from '@/components/ui/testUtils'
import { useLanguagePairStore } from './languagePair'
import TranslatePage from './TranslatePage'

type FakeState = VoiceTranslationState & { isSupported: boolean; canSpeak: boolean }

/** Controllable stand-in for useVoiceTranslation: tests drive the phase, the page reacts. */
const mock = vi.hoisted(() => {
  const initial: FakeState = {
    phase: 'idle',
    partialTranscript: '',
    result: null,
    error: null,
    speaking: false,
    speechError: null,
    isSupported: true,
    canSpeak: true,
  }
  const listeners = new Set<() => void>()
  let state: FakeState = { ...initial }
  const fns = { start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), reset: vi.fn(), speak: vi.fn(), stopSpeaking: vi.fn() }
  const permission = vi.fn<() => Promise<MicrophonePermission>>()
  return {
    fns,
    permission,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (patch: Partial<FakeState>) => {
      state = { ...state, ...patch }
      listeners.forEach((l) => l())
    },
    reset: () => {
      state = { ...initial }
      Object.values(fns).forEach((f) => f.mockReset())
      permission.mockReset()
      permission.mockResolvedValue('prompt')
    },
  }
})

vi.mock('@/hooks/useVoiceTranslation', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useVoiceTranslation: () => ({ ...useSyncExternalStore(mock.subscribe, mock.getState), ...mock.fns }),
  }
})

vi.mock('@/services/speech', () => ({ getMicrophonePermission: mock.permission }))

setupUiTests()

const CORRECTED: VoiceTranslationResult = {
  original: 'ola tudo bem',
  corrected: 'Olá, tudo bem?',
  corrections: ['accents', 'punctuation'],
  translation: 'Hi, how are you?',
  from: 'pt-PT',
  to: 'en',
}

const renderPage = () =>
  renderUi(
    <ToastProvider>
      <TranslatePage />
    </ToastProvider>,
  )

beforeEach(() => {
  mock.reset()
  useLanguagePairStore.setState({ pair: null })
  useProfileStore.setState({ myLanguage: 'pt-PT' })
  useSettingsStore.setState({ appLanguage: 'pt-PT', conversationLanguage: 'en' })
})

describe('TranslatePage — microphone', () => {
  it('starts with the profile/settings pair, stops while listening and ignores taps while busy', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Tradutor' })).toBeInTheDocument()
    expect(screen.getByText('Toca no microfone e fala em português.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toca para falar' }))
    expect(mock.fns.start).toHaveBeenCalledWith({ from: 'pt-PT', to: 'en' })

    act(() => mock.set({ phase: 'listening', partialTranscript: 'olá tudo' }))
    expect(screen.getByText('A ouvir…')).toBeInTheDocument()
    expect(screen.getByText('olá tudo')).toBeInTheDocument()
    expect(screen.getByText('Passo 1 de 4: A ouvir')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toca para parar' }))
    expect(mock.fns.stop).toHaveBeenCalledOnce()

    act(() => mock.set({ phase: 'processing', partialTranscript: 'olá tudo bem' }))
    const processing = screen.getByRole('button', { name: 'A processar…' })
    expect(processing).toHaveAttribute('aria-disabled', 'true')
    await user.click(processing)
    act(() => mock.set({ phase: 'translating' }))
    expect(screen.getByText('Passo 3 de 4: A traduzir')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'A traduzir…' }))
    expect(mock.fns.start).toHaveBeenCalledOnce()
    expect(mock.fns.stop).toHaveBeenCalledOnce()

    act(() => mock.set({ phase: 'done', result: CORRECTED }))
    await user.click(screen.getByRole('button', { name: 'Falar outra vez' }))
    expect(mock.fns.start).toHaveBeenCalledTimes(2)
  })

  it('cancels the capture when the page is left', () => {
    const { unmount } = renderPage()
    act(() => mock.set({ phase: 'listening' }))
    unmount()
    expect(mock.fns.cancel).toHaveBeenCalled()
  })
})

describe('TranslatePage — result', () => {
  it('shows the corrected text, keeps the original visible and lists the corrections', () => {
    mock.set({ phase: 'done', partialTranscript: CORRECTED.original, result: CORRECTED })
    renderPage()
    expect(screen.getByText('Olá, tudo bem?')).toBeInTheDocument()
    expect(screen.getByText('Original: ola tudo bem')).toBeInTheDocument()
    expect(screen.getByText('Hi, how are you?')).toBeInTheDocument()
    expect(screen.getByText('Corrigido: pontuação e acentos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tradução · Inglês' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reconhecido · Português' })).toBeInTheDocument()
  })

  it('without a correction shows only the original and no pill', () => {
    mock.set({ phase: 'done', result: { ...CORRECTED, corrected: null, corrections: [] } })
    renderPage()
    expect(screen.getByText('ola tudo bem')).toBeInTheDocument()
    expect(screen.queryByText(/^Original:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Corrigido:/)).not.toBeInTheDocument()
  })

  it('copies the translation and confirms with a toast (or explains the failure)', async () => {
    const user = userEvent.setup()
    mock.set({ phase: 'done', result: CORRECTED })
    renderPage()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(screen.getByRole('button', { name: 'Copiar tradução' }))
    expect(writeText).toHaveBeenCalledWith('Hi, how are you?')
    expect(await screen.findByText('Tradução copiada')).toBeInTheDocument()

    writeText.mockRejectedValueOnce(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Copiar tradução' }))
    expect(await screen.findByText('Não foi possível copiar a tradução')).toBeInTheDocument()
  })

  it('"Ouvir" toggles speak/stopSpeaking with aria-pressed; TTS failures become a toast', async () => {
    const user = userEvent.setup()
    mock.set({ phase: 'done', result: CORRECTED })
    renderPage()
    const listen = screen.getByRole('button', { name: 'Ouvir' })
    expect(listen).toHaveAttribute('aria-pressed', 'false')
    await user.click(listen)
    expect(mock.fns.speak).toHaveBeenCalledOnce()

    act(() => mock.set({ speaking: true }))
    const playing = screen.getByRole('button', { name: 'A reproduzir…' })
    expect(playing).toHaveAttribute('aria-pressed', 'true')
    await user.click(playing)
    expect(mock.fns.stopSpeaking).toHaveBeenCalledOnce()

    act(() => mock.set({ speaking: false, speechError: new AppError('unavailable') }))
    expect(await screen.findByText('Não foi possível reproduzir a tradução')).toBeInTheDocument()
  })

  it('disables "Ouvir" with an explanation when text-to-speech is unavailable', () => {
    mock.set({ phase: 'done', result: CORRECTED, canSpeak: false })
    renderPage()
    expect(screen.getByRole('button', { name: 'Ouvir' })).toBeDisabled()
    expect(screen.getByText('A leitura em voz alta não está disponível neste browser.')).toBeInTheDocument()
  })
})

describe('TranslatePage — errors', () => {
  it('permission-denied explains how to allow the microphone and the mic stays usable', async () => {
    const user = userEvent.setup()
    mock.set({ phase: 'error', error: new AppError('permission-denied') })
    renderPage()
    expect(screen.getByText('Permissão recusada')).toBeInTheDocument()
    expect(screen.getByText(/O Tradutor precisa do microfone\. Permite o acesso ao microfone nas definições do browser/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toca para tentar outra vez' }))
    expect(mock.fns.start).toHaveBeenCalledWith({ from: 'pt-PT', to: 'en' })
  })

  it('not-configured says the translation service is not available in this version', () => {
    mock.set({ phase: 'error', partialTranscript: 'olá', error: new AppError('not-configured') })
    renderPage()
    expect(screen.getByText('Serviço ainda não disponível')).toBeInTheDocument()
    expect(screen.getByText('O serviço de tradução ainda não está disponível nesta versão da app.')).toBeInTheDocument()
    // what was heard is not lost
    expect(screen.getByText('olá')).toBeInTheDocument()
  })

  it('warns before the first tap when the microphone is blocked or recognition is unsupported', async () => {
    mock.permission.mockResolvedValue('denied')
    const { unmount } = renderPage()
    expect(await screen.findByText('Permissão recusada')).toBeInTheDocument()
    unmount()

    mock.permission.mockResolvedValue('prompt')
    mock.set({ isSupported: false })
    renderPage()
    expect(screen.getByText('Não suportado neste dispositivo')).toBeInTheDocument()
    expect(screen.getByText(/Abre a Erasmus Help no Chrome, no Edge ou no Safari/)).toBeInTheDocument()
  })
})

describe('TranslatePage — languages', () => {
  it('swaps, picks from the sheets (same language → swap) and keeps the pair across visits', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPage()
    expect(screen.getByRole('button', { name: 'Idioma de origem: Português' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idioma de destino: Inglês' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trocar idiomas' }))
    expect(screen.getByRole('button', { name: 'Idioma de origem: Inglês' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idioma de destino: Português' })).toBeInTheDocument()

    // choosing the target's language as source swaps them back
    await user.click(screen.getByRole('button', { name: 'Idioma de origem: Inglês' }))
    expect(screen.getByRole('dialog', { name: 'Idioma de origem' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Português' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idioma de origem: Português' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idioma de destino: Inglês' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Idioma de destino: Inglês' }))
    await user.click(screen.getByRole('option', { name: 'Polaco' }))
    expect(screen.getByRole('button', { name: 'Idioma de destino: Polaco' })).toBeInTheDocument()

    unmount()
    renderPage()
    expect(screen.getByRole('button', { name: 'Idioma de destino: Polaco' })).toBeInTheDocument()
  })

  it('changing languages mid-capture cancels it; a finished result stays visible', async () => {
    const user = userEvent.setup()
    mock.set({ phase: 'listening' })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Trocar idiomas' }))
    expect(mock.fns.cancel).toHaveBeenCalledOnce()

    mock.fns.cancel.mockClear()
    act(() => mock.set({ phase: 'done', result: CORRECTED }))
    await user.click(screen.getByRole('button', { name: 'Trocar idiomas' }))
    expect(mock.fns.cancel).not.toHaveBeenCalled()
    expect(screen.getByText('Hi, how are you?')).toBeInTheDocument()
    // labels follow the result, not the swapped pair
    expect(screen.getByRole('heading', { name: 'Tradução · Inglês' })).toBeInTheDocument()
  })
})
