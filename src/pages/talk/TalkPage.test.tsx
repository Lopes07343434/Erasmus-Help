import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import type { PracticeConversationState } from '@/hooks/usePracticeConversation'
import type { VoiceTranslationState } from '@/hooks/useVoiceTranslation'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { setupUiTests } from '@/components/ui/testUtils'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AppError } from '@/services/errors'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import TalkPage from './TalkPage'
import { useTalkStore } from './talkStore'

/** Minimal external stores driving the mocked hooks (updates re-render the page like the real hooks). */
const h = vi.hoisted(() => {
  function store<T extends object>(initial: T) {
    let state = initial
    const listeners = new Set<() => void>()
    return {
      get: () => state,
      set(patch: Partial<T>) {
        state = { ...state, ...patch }
        listeners.forEach((l) => l())
      },
      reset() {
        state = initial
      },
      subscribe(l: () => void) {
        listeners.add(l)
        return () => {
          listeners.delete(l)
        }
      },
    }
  }
  const voiceInitial: VoiceTranslationState = { phase: 'idle', partialTranscript: '', result: null, error: null, speaking: false, speechError: null }
  const practiceInitial: PracticeConversationState = { state: 'idle', history: [], error: null, partialTranscript: '', muted: false, scenario: 'cafe' }
  return {
    voice: store(voiceInitial),
    voiceFns: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), reset: vi.fn(), speak: vi.fn(), stopSpeaking: vi.fn() },
    practice: store(practiceInitial),
    practiceFns: { start: vi.fn(), tap: vi.fn(), interrupt: vi.fn(), setMuted: vi.fn(), toggleMute: vi.fn(), setScenario: vi.fn(), reset: vi.fn() },
  }
})

vi.mock('@/hooks/useVoiceTranslation', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useVoiceTranslation: () => ({ ...useSyncExternalStore(h.voice.subscribe, h.voice.get), isSupported: true, canSpeak: true, ...h.voiceFns }),
  }
})

vi.mock('@/hooks/usePracticeConversation', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    usePracticeConversation: () => ({ ...useSyncExternalStore(h.practice.subscribe, h.practice.get), isSupported: true, canSpeak: true, ...h.practiceFns }),
  }
})

setupUiTests()

beforeAll(() => {
  // jsdom has no matchMedia (used for the short-viewport sphere size).
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  vi.clearAllMocks()
  h.voice.reset()
  h.practice.reset()
  useTalkStore.setState({ languages: null, scenario: 'cafe' })
  useProfileStore.setState({ myLanguage: 'pt-PT', name: '' })
  useSettingsStore.setState({ appLanguage: 'pt-PT', conversationLanguage: 'es' })
})

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderTalk(entry = '/talk') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <ToastProvider>
          <TalkPage />
          <LocationProbe />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const personTab = () => screen.getByRole('tab', { name: 'Conversar com pessoa' })
const trainTab = () => screen.getByRole('tab', { name: 'Treinar com a app' })
const sideA = () => screen.getByRole('region', { name: 'O teu lado' })
const sideB = () => screen.getByRole('region', { name: 'Lado da outra pessoa' })

describe('TalkPage — modes and URL', () => {
  it('defaults to person mode and switches through ?mode= (replace), halting the mode it leaves', async () => {
    const user = userEvent.setup()
    renderTalk('/talk')
    expect(personTab()).toHaveAttribute('aria-selected', 'true')
    expect(sideA()).toBeInTheDocument()

    await user.click(trainTab())
    expect(screen.getByTestId('location')).toHaveTextContent('/talk?mode=train')
    expect(trainTab()).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Treino no café' })).toBeInTheDocument()
    // The opening line starts inside the tab tap (iOS speech needs a user gesture); person mode is halted.
    expect(h.practiceFns.start).toHaveBeenCalledTimes(1)
    expect(h.voiceFns.cancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'O teu lado' })).not.toBeInTheDocument()

    await user.click(personTab())
    expect(screen.getByTestId('location')).toHaveTextContent('/talk?mode=person')
    expect(h.practiceFns.reset).toHaveBeenCalledTimes(1)
    expect(sideA()).toBeInTheDocument()
  })

  it('opens train mode straight from the URL without speaking until the first tap', async () => {
    const user = userEvent.setup()
    renderTalk('/talk?mode=train')
    expect(trainTab()).toHaveAttribute('aria-selected', 'true')
    expect(h.practiceFns.start).not.toHaveBeenCalled()
    expect(screen.getByText('Toca na esfera para começar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Começar o treino' }))
    expect(h.practiceFns.start).toHaveBeenCalledTimes(1)
    expect(h.practiceFns.tap).not.toHaveBeenCalled()
  })
})

describe('TalkPage — Conversar com pessoa', () => {
  it('speaker A translates A → B; B cannot talk while A is busy', async () => {
    const user = userEvent.setup()
    renderTalk('/talk?mode=person')
    // Each panel speaks its own language (A: pt-PT, B: es).
    expect(within(sideB()).getByText('Toca Hablar y habla en español.')).toBeInTheDocument()
    expect(screen.getByText('Pousa o telemóvel na mesa, entre os dois')).toBeInTheDocument()

    await user.click(within(sideA()).getByRole('button', { name: 'Falar' }))
    expect(h.voiceFns.start).toHaveBeenCalledWith({ from: 'pt-PT', to: 'es' })

    act(() => h.voice.set({ phase: 'listening' }))
    expect(within(sideA()).getByRole('button', { name: 'Parar' })).toBeEnabled()
    expect(within(sideB()).getByRole('button', { name: 'Hablar' })).toBeDisabled()
    expect(screen.getByText('A ouvir-te')).toBeInTheDocument()

    await user.click(within(sideA()).getByRole('button', { name: 'Parar' }))
    expect(h.voiceFns.stop).toHaveBeenCalledTimes(1)

    act(() => h.voice.set({ phase: 'translating', partialTranscript: 'olá' }))
    expect(within(sideB()).getByRole('button', { name: 'Hablar' })).toBeDisabled()
    expect(within(sideB()).getByText('Traduciendo…')).toBeInTheDocument()
    expect(screen.getByText('A traduzir para espanhol')).toBeInTheDocument()

    act(() =>
      h.voice.set({
        phase: 'done',
        speaking: false,
        result: { original: 'olá', corrected: 'Olá.', corrections: [], translation: 'Hola.', from: 'pt-PT', to: 'es' },
      }),
    )
    expect(within(sideB()).getByText('Hola.')).toBeInTheDocument()
    expect(within(sideB()).getByText('Traducido del portugués')).toBeInTheDocument()
    expect(within(sideB()).getByRole('button', { name: 'Hablar' })).toBeEnabled()
    await user.click(within(sideB()).getByRole('button', { name: 'Escuchar otra vez' }))
    expect(h.voiceFns.speak).toHaveBeenCalledTimes(1)

    await user.click(within(sideB()).getByRole('button', { name: 'Hablar' }))
    expect(h.voiceFns.start).toHaveBeenLastCalledWith({ from: 'es', to: 'pt-PT' })
  })

  it('shows the localized error in the bridge and toasts when there is no voice for the translation', () => {
    renderTalk('/talk')
    act(() => h.voice.set({ phase: 'error', error: new AppError('no-speech') }))
    expect(screen.getByText('Não ouvimos nada')).toHaveClass('text-danger')

    act(() =>
      h.voice.set({
        phase: 'done',
        error: null,
        result: { original: 'olá', corrected: null, corrections: [], translation: 'Hola', from: 'pt-PT', to: 'es' },
        speechError: new AppError('not-supported'),
      }),
    )
    expect(screen.getByText('Não há voz para espanhol neste dispositivo. A tradução fica no ecrã.')).toBeInTheDocument()
    expect(within(sideB()).getByText('Hola')).toBeInTheDocument()
  })
})

describe('TalkPage — Treinar com a app', () => {
  const started = { history: [{ id: 1, role: 'assistant' as const, text: '¡Hola! ¿Qué te pongo?', translation: 'Olá! O que te sirvo?' }] }

  it('sphere tap goes to the conversation; when muted it shows a toast instead', async () => {
    const user = userEvent.setup()
    h.practice.set(started)
    renderTalk('/talk?mode=train')
    expect(screen.getByText('¡Hola! ¿Qué te pongo?')).toBeInTheDocument()
    expect(screen.getByText('Responde em espanhol')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Falar com a app' }))
    expect(h.practiceFns.tap).toHaveBeenCalledTimes(1)

    act(() => h.practice.set({ muted: true }))
    expect(screen.getByRole('button', { name: 'Desativar microfone' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Falar com a app' }))
    expect(h.practiceFns.tap).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Microfone desativado')).toBeInTheDocument()
  })

  it('changing the scenario calls setScenario then start', async () => {
    const user = userEvent.setup()
    h.practice.set(started)
    renderTalk('/talk?mode=train')
    await user.click(screen.getByRole('button', { name: 'Mudar cenário' }))
    await user.click(screen.getByRole('option', { name: /Senhorio/ }))
    expect(h.practiceFns.setScenario).toHaveBeenCalledWith('landlord')
    expect(h.practiceFns.start).toHaveBeenCalledTimes(1)
    const [setOrder] = h.practiceFns.setScenario.mock.invocationCallOrder
    const [startOrder] = h.practiceFns.start.mock.invocationCallOrder
    expect(setOrder).toBeLessThan(startOrder ?? 0)
    expect(useTalkStore.getState().scenario).toBe('landlord')
  })
})
