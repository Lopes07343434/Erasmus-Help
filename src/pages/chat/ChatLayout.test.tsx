import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useSettingsStore } from '@/stores/settingsStore'
import ChatLayout from './ChatLayout'
import ConversationPage from './ConversationPage'
import { chatMock, conversationState, listState, makeDirect, makeGroup, makeMe, MONITOR, readySession, STUDENT_ANA } from './testFixtures'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

let desktop = true

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderChat(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/chat" element={<ChatLayout />}>
              <Route path=":conversationId" element={<ConversationPage />} />
            </Route>
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const DIRECT = makeDirect({ id: 'c-joao', otherUser: MONITOR })
const DIRECT_ANA = makeDirect({ id: 'c-ana', otherUser: STUDENT_ANA })
const GROUP = makeGroup({ id: 'g1', name: 'Erasmus Milão', membersCount: 3 })

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
  desktop = true
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width: 1024px') ? desktop : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  chatMock.set({
    session: readySession(makeMe()),
    lists: { direct: listState([DIRECT, DIRECT_ANA]), group: listState([GROUP]) },
    conversation: conversationState({ conversation: DIRECT, messages: [] }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ChatLayout — desktop split view', () => {
  it('shows the list next to a placeholder when no conversation is open', () => {
    renderChat('/chat')
    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^João Pereira/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Escolhe uma conversa')).toBeInTheDocument()
    expect(screen.getByText('Abre uma conversa ou um grupo da lista, ou começa uma nova.')).toBeInTheDocument()
  })

  it('shows the open conversation next to the list, highlighted, without a back button', async () => {
    const user = userEvent.setup()
    renderChat('/chat/c-joao')
    expect(screen.getByRole('link', { name: /^João Pereira/ })).toHaveAttribute('aria-current', 'page')
    // The list keeps the page's h1; the conversation title is an h2 in its header.
    const header = screen.getByRole('heading', { level: 2, name: 'João Pereira' }).closest('header') as HTMLElement
    expect(within(header).getByText('ID: 03')).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: 'Voltar ao Chat' })).not.toBeInTheDocument()
    expect(screen.queryByText('Escolhe uma conversa')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toBeInTheDocument()

    // Opening another conversation keeps the list (and its search) in place.
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar no chat' }), 'ana')
    chatMock.set({ conversation: conversationState({ conversation: DIRECT_ANA, messages: [] }) })
    await user.click(screen.getByRole('link', { name: /^Ana Costa/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-ana')
    expect(screen.getByRole('searchbox', { name: 'Pesquisar no chat' })).toHaveValue('ana')
    expect(screen.getByRole('link', { name: /^Ana Costa/ })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the selected tab while opening conversations', async () => {
    const user = userEvent.setup()
    chatMock.set({ conversation: conversationState({ conversation: GROUP, messages: [] }) })
    renderChat('/chat?tab=grupos')
    await user.click(screen.getByRole('link', { name: /^Erasmus Milão/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1?tab=grupos')
    expect(screen.getByRole('tab', { name: /Grupos/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /^Erasmus Milão/ })).toHaveAttribute('aria-current', 'page')

    // An explicit choice next to an open group sticks.
    await user.click(screen.getByRole('tab', { name: /Conversas/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1?tab=conversas')
    expect(screen.getByRole('tab', { name: /Conversas/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('a group opened from elsewhere (no ?tab=) shows the Grupos tab', () => {
    chatMock.set({ conversation: conversationState({ conversation: GROUP, messages: [] }) })
    renderChat('/chat/g1')
    expect(screen.getByRole('tab', { name: /Grupos/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /^Erasmus Milão/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('ChatLayout — mobile', () => {
  it('shows one screen at a time', () => {
    desktop = false
    const { unmount } = renderChat('/chat')
    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument()
    expect(screen.queryByText('Escolhe uma conversa')).not.toBeInTheDocument()
    unmount()

    renderChat('/chat/c-joao')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { level: 1, name: 'João Pereira' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Voltar ao Chat' })).toBeInTheDocument()
  })
})
