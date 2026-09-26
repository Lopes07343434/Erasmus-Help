import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { AppError } from '@/services/errors'
import { useSettingsStore } from '@/stores/settingsStore'
import ChatPage from './ChatPage'
import {
  chatMock,
  directChats,
  groupActions,
  listState,
  makeDirect,
  makeGroup,
  makeMe,
  MONITOR,
  peopleSearchRetry,
  person,
  readySession,
  STUDENT_ANA,
} from './testFixtures'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderChat(entry = '/chat') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<p>conversation-screen</p>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const now = new Date()
const today = (h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString()

const SAMUEL = person('u-sam', 15, 'Samuel Lopes', 'monitor')
const ID_01 = person('u-one', 1, 'Beatriz Nunes', 'student')
const ID_10 = person('u-ten', 10, 'Carlos Dias', 'student')
const DIRECTORY = [ID_01, ID_10, STUDENT_ANA, SAMUEL, MONITOR]

/** Ready session (me = ID 07) with one direct chat (Ana) and one group, and a searchable directory. */
function withChats() {
  chatMock.set({
    session: readySession(makeMe({ publicId: 7 })),
    directory: DIRECTORY,
    lists: {
      direct: listState([makeDirect({ id: 'c-ana', otherUser: STUDENT_ANA })]),
      group: listState([makeGroup({ id: 'g1', name: 'Erasmus Milão' })]),
    },
  })
}

const searchField = () => screen.getByRole('searchbox', { name: 'Pesquisar no chat' })

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
})

describe('ChatPage', () => {
  it('shows the header, search and tabs at once, with a skeleton while connecting', () => {
    chatMock.set({ session: { status: 'connecting', me: null, error: null, retry: vi.fn() } })
    renderChat()
    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument()
    expect(searchField()).toBeDisabled()
    expect(screen.getByRole('tab', { name: /Conversas/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Grupos/ })).toBeInTheDocument()
    expect(screen.getByText('A ligar ao chat…')).toBeInTheDocument()
    // No actions until the session is ready.
    expect(screen.queryByRole('button', { name: 'Adicionar pessoa' })).not.toBeInTheDocument()
  })

  it('explains when the chat is not available in this build', () => {
    renderChat()
    expect(screen.getByText('Chat indisponível')).toBeInTheDocument()
    expect(screen.getByText('O chat ainda não está disponível nesta versão da app.')).toBeInTheDocument()
  })

  it('offers a retry when the session failed (anonymous sign-ins disabled)', async () => {
    const retry = vi.fn()
    chatMock.set({ session: { status: 'error', me: null, error: Object.assign(new AppError('not-configured'), { chatCode: 'anonymous_disabled' }), retry } })
    renderChat()
    expect(screen.getByRole('alert')).toHaveTextContent('O acesso ao chat está desativado de momento.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('lists direct conversations with the person’s ID, "Tu:" prefix, audio preview and a capped unread badge', () => {
    const me = makeMe()
    chatMock.set({
      session: readySession(me),
      unread: { total: 150, direct: 150, groups: 0 },
      lists: {
        direct: listState([
          makeDirect({
            id: 'c1',
            otherUser: MONITOR,
            unreadCount: 150,
            lastMessageAt: today(9, 5),
            lastMessage: { id: 'm1', kind: 'audio', preview: null, audioDurationMs: 12_000, senderId: MONITOR.id, senderName: MONITOR.displayName, createdAt: today(9, 5) },
          }),
          makeDirect({
            id: 'c2',
            otherUser: STUDENT_ANA,
            lastMessageAt: today(8, 0),
            lastMessage: { id: 'm2', kind: 'text', preview: 'Até amanhã', audioDurationMs: null, senderId: me.id, senderName: me.displayName, createdAt: today(8, 0) },
          }),
        ]),
        group: listState([]),
      },
    })
    renderChat()

    const first = screen.getByRole('link', { name: /^João Pereira/ })
    expect(first).toHaveAttribute('href', '/chat/c1')
    expect(first).toHaveAccessibleName('João Pereira, ID: 03, Monitor, 150 mensagens não lidas, Última mensagem: Áudio 0:12, 09:05')
    expect(within(first).getByText('ID: 03')).toBeInTheDocument()
    expect(within(first).getByText('99+')).toBeInTheDocument()
    expect(within(first).getByText('Áudio 0:12')).toBeInTheDocument()

    const second = screen.getByRole('link', { name: /^Ana Costa, ID: 12, Aluno/ })
    expect(within(second).getByText('Tu:')).toBeInTheDocument()
    // Tab counter and the tab's action.
    expect(screen.getByRole('tab', { name: /Conversas, 150 mensagens não lidas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar pessoa' })).toBeInTheDocument()
  })

  it('syncs the tab with ?tab= and shows groups with participants and their action', async () => {
    const user = userEvent.setup()
    chatMock.set({
      session: readySession(makeMe()),
      unread: { total: 2, direct: 0, groups: 2 },
      lists: {
        direct: listState([]),
        group: listState([
          makeGroup({
            id: 'g1',
            membersCount: 12,
            unreadCount: 2,
            lastMessageAt: today(10, 0),
            lastMessage: { id: 'm', kind: 'text', preview: 'Reunião às 5', audioDurationMs: null, senderId: MONITOR.id, senderName: 'João', createdAt: today(10, 0) },
          }),
        ]),
      },
    })
    renderChat()
    await user.click(screen.getByRole('tab', { name: /Grupos, 2 mensagens não lidas/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat?tab=grupos')
    const row = screen.getByRole('link', { name: /^Erasmus Milão, 12 participantes, 2 mensagens não lidas, Última mensagem: João: Reunião às 5/ })
    expect(row).toHaveAttribute('href', '/chat/g1?tab=grupos')
    expect(within(row).getByTitle('12 participantes')).toHaveTextContent('12')
    // Anyone can create a group.
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar pessoa' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Conversas/ }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/chat$/)
  })

  it('no conversations: explains, offers "Adicionar pessoa" and my ID to copy', async () => {
    const user = userEvent.setup() // installs a clipboard stub
    chatMock.set({ session: readySession(makeMe({ publicId: 7 })) })
    renderChat()
    expect(screen.getByText('Ainda não tens conversas.')).toBeInTheDocument()
    expect(screen.getByText('Adiciona uma pessoa através do ID para começar.')).toBeInTheDocument()
    // Header action + the empty state's own button.
    expect(screen.getAllByRole('button', { name: 'Adicionar pessoa' })).toHaveLength(2)

    const card = screen.getByRole('region', { name: 'O teu ID' })
    expect(within(card).getByText('07')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Copiar o teu ID (ID: 07)' }))
    expect(await navigator.clipboard.readText()).toBe('ID: 07')
    expect(await screen.findByText('ID copiado')).toBeInTheDocument()
  })

  it('no groups: explains and offers "Criar grupo"', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe()) })
    renderChat('/chat?tab=grupos')
    expect(screen.getByText('Ainda não estás em nenhum grupo')).toBeInTheDocument()
    expect(screen.getByText('Cria um grupo para falares com várias pessoas ao mesmo tempo.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Criar grupo' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1] as HTMLElement)
    expect(screen.getByRole('dialog', { name: 'Criar grupo' })).toBeInTheDocument()
  })

  it('list loading shows a skeleton, a failed list offers a retry', async () => {
    const refresh = vi.fn()
    chatMock.set({ session: readySession(makeMe()), lists: { direct: listState([], { status: 'loading' }), group: listState([]) } })
    const { unmount } = renderChat()
    expect(screen.getByRole('status', { busy: true })).toBeInTheDocument()
    // The action is available while the list loads.
    expect(screen.getByRole('button', { name: 'Adicionar pessoa' })).toBeInTheDocument()
    unmount()

    chatMock.set({ lists: { direct: listState([], { status: 'error', error: new AppError('unavailable'), refresh }), group: listState([]) } })
    renderChat()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  describe('search', () => {
    it('by ID: the exact ID comes first ("15 — Samuel Lopes — Monitor") and replaces the tabs', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), '15')
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      const people = screen.getByRole('region', { name: 'Pessoas' })
      const rows = within(people).getAllByRole('button')
      expect(rows[0]).toHaveAccessibleName('Abrir conversa com Samuel Lopes')
      expect(rows[0]).toHaveAccessibleDescription('15 — Samuel Lopes — Monitor')
      expect(within(rows[0] as HTMLElement).getByText('ID exato')).toBeInTheDocument()

      await user.clear(searchField())
      expect(screen.getByRole('tablist')).toBeInTheDocument()
    })

    it('by ID: "01" + Enter opens ID 01, never 10', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), '01')
      const rows = within(screen.getByRole('region', { name: 'Pessoas' })).getAllByRole('button')
      // The server also lists IDs starting with the digits (10, 12, 15): the exact ID 01 comes first.
      expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
        'Abrir conversa com Beatriz Nunes',
        'Abrir conversa com Carlos Dias',
        'Abrir conversa com Ana Costa',
        'Abrir conversa com Samuel Lopes',
      ])
      await user.keyboard('{Enter}')
      expect(directChats.startDirectConversation).toHaveBeenCalledTimes(1)
      expect(directChats.startDirectConversation).toHaveBeenCalledWith(1)
      expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-new')
    })

    it('by name: "Samuel Lopes / ID: 15 / Monitor", and a tap on the row opens the chat', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), 'samuel')
      const row = within(screen.getByRole('region', { name: 'Pessoas' })).getByRole('button', { name: 'Abrir conversa com Samuel Lopes' })
      expect(within(row).getByText('Samuel Lopes')).toBeInTheDocument()
      expect(within(row).getByText('ID: 15')).toBeInTheDocument()
      expect(within(row).getByText('Monitor')).toBeInTheDocument()
      await user.click(row)
      expect(directChats.startDirectConversation).toHaveBeenCalledWith(15)
      expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
    })

    it('matches my conversations (by name or ID) and groups locally, without repeating those people', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), 'ana')
      const conversations = screen.getByRole('region', { name: 'Conversas' })
      expect(within(conversations).getByRole('link', { name: /^Ana Costa, ID: 12/ })).toHaveAttribute('href', '/chat/c-ana')
      // Ana is already under "Conversas": no "Pessoas" section for her alone.
      expect(screen.queryByRole('region', { name: 'Pessoas' })).not.toBeInTheDocument()

      await user.clear(searchField())
      await user.type(searchField(), '12')
      expect(within(screen.getByRole('region', { name: 'Conversas' })).getByRole('link', { name: /^Ana Costa/ })).toBeInTheDocument()

      await user.clear(searchField())
      await user.type(searchField(), 'milao')
      expect(within(screen.getByRole('region', { name: 'Grupos' })).getByRole('link', { name: /^Erasmus Milão/ })).toHaveAttribute('href', '/chat/g1?tab=grupos')
    })

    it('explains no results, searching and errors (with retry)', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), 'zzz')
      expect(screen.getByText('Sem resultados para «zzz».')).toBeInTheDocument()

      act(() => chatMock.set({ peopleSearch: { status: 'loading', query: 'zzz', results: [], stale: false, error: null } }))
      expect(screen.getByText('A pesquisar…')).toBeInTheDocument()

      act(() => chatMock.set({ peopleSearch: { status: 'error', query: 'zzz', results: [], stale: false, error: new AppError('unavailable') } }))
      expect(screen.getByText('Não foi possível pesquisar.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
      expect(peopleSearchRetry).toHaveBeenCalledTimes(1)
    })

    it('asks for more than one letter of a name', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.type(searchField(), 's')
      expect(screen.getByText('Escreve um ID (por exemplo 07) ou pelo menos 2 letras de um nome.')).toBeInTheDocument()
    })
  })

  describe('Adicionar pessoa', () => {
    it('finds someone by ID and lands in the conversation', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
      const dialog = screen.getByRole('dialog', { name: 'Adicionar pessoa' })
      const field = within(dialog).getByRole('searchbox', { name: 'Introduzir ID' })
      expect(field).toHaveFocus()

      await user.type(field, '15')
      expect(within(dialog).getByRole('heading', { name: 'Utilizador encontrado' })).toBeInTheDocument()
      const row = within(dialog).getByRole('group', { name: '15 — Samuel Lopes — Monitor' })
      await user.click(within(row).getByRole('button', { name: 'Adicionar Samuel Lopes e abrir a conversa' }))

      expect(directChats.startDirectConversation).toHaveBeenCalledWith(15)
      expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-new')
      expect(screen.getByText('Conversa com Samuel Lopes criada')).toBeInTheDocument()
    })

    it('explains an unknown ID and my own ID; Enter picks the exact match; errors stay in the sheet', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat()
      await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }))
      const dialog = screen.getByRole('dialog', { name: 'Adicionar pessoa' })
      const field = within(dialog).getByRole('searchbox', { name: 'Introduzir ID' })

      await user.type(field, '99')
      expect(within(dialog).getByText('Nenhum utilizador encontrado com esse ID.')).toBeInTheDocument()

      await user.clear(field)
      await user.type(field, 'ID: 07')
      expect(within(dialog).getByText('Esse é o teu ID.')).toBeInTheDocument()

      directChats.startDirectConversation.mockRejectedValueOnce(Object.assign(new AppError('not-found'), { chatCode: 'not_found' }))
      await user.clear(field)
      await user.type(field, '01{Enter}')
      expect(directChats.startDirectConversation).toHaveBeenLastCalledWith(1)
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Nenhum utilizador encontrado com esse ID.')
      expect(screen.getByRole('dialog', { name: 'Adicionar pessoa' })).toBeInTheDocument()
    })
  })

  describe('Criar grupo', () => {
    it('requires a name, selects participants across searches and opens the new group', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat('/chat?tab=grupos')
      await user.click(screen.getByRole('button', { name: 'Criar grupo' }))
      const dialog = screen.getByRole('dialog', { name: 'Criar grupo' })
      expect(within(dialog).getByRole('textbox', { name: 'Nome do grupo' })).toHaveFocus()

      // Name required.
      await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
      expect(within(dialog).getByText('Dá um nome ao grupo.')).toBeInTheDocument()

      // Enter in the name moves on to the participants search.
      await user.type(within(dialog).getByRole('textbox', { name: 'Nome do grupo' }), '  Turma   de março {Enter}')
      const search = within(dialog).getByRole('searchbox', { name: 'Adicionar participantes' })
      expect(search).toHaveFocus()
      expect(within(dialog).getByText('Ainda não escolheste ninguém. Também podes adicionar participantes mais tarde.')).toBeInTheDocument()

      // Tap to select by name…
      await user.type(search, 'ana')
      const ana = within(dialog).getByRole('checkbox', { name: '12 — Ana Costa — Aluno' })
      await user.click(ana)
      expect(ana).toHaveAttribute('aria-checked', 'true')
      // …Enter selects the exact ID and clears the field for the next one.
      await user.clear(search)
      await user.type(search, '15{Enter}')
      expect(search).toHaveValue('')

      const participants = within(dialog).getByRole('region', { name: 'Participantes' })
      expect(within(participants).getByText('2 selecionados')).toBeInTheDocument()
      expect(within(participants).getByText('Ana Costa')).toBeInTheDocument()
      expect(within(participants).getByText('Samuel Lopes')).toBeInTheDocument()

      // Removable, and selectable again.
      await user.click(within(participants).getByRole('button', { name: 'Tirar Ana Costa da seleção' }))
      expect(within(participants).getByText('1 selecionado')).toBeInTheDocument()
      // The keyboard focus moves to the next row on the next frame: wait for it, or it lands mid-typing below.
      await waitFor(() => expect(within(participants).getByRole('button', { name: 'Tirar Samuel Lopes da seleção' })).toHaveFocus())
      await user.type(search, 'ana')
      await user.click(within(dialog).getByRole('checkbox', { name: '12 — Ana Costa — Aluno' }))

      await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
      expect(groupActions.createGroup).toHaveBeenCalledWith({ name: 'Turma de março', memberPublicIds: [15, 12], allowLeave: true })
      expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-new?tab=grupos')
      expect(screen.getByText('Grupo criado')).toBeInTheDocument()
    })

    it('shows a server refusal inside the sheet', async () => {
      const user = userEvent.setup()
      groupActions.createGroup.mockRejectedValueOnce(Object.assign(new AppError('permission-denied'), { chatCode: 'not_allowed' }))
      withChats()
      renderChat('/chat?tab=grupos')
      await user.click(screen.getByRole('button', { name: 'Criar grupo' }))
      const dialog = screen.getByRole('dialog', { name: 'Criar grupo' })
      await user.type(within(dialog).getByRole('textbox', { name: 'Nome do grupo' }), 'Viagem')
      await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
      expect(groupActions.createGroup).toHaveBeenCalledWith({ name: 'Viagem', memberPublicIds: [], allowLeave: true })
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não tens permissão para fazer isto.')
    })

    it('only platform admins can create a group whose members cannot leave', async () => {
      const user = userEvent.setup()
      withChats()
      renderChat('/chat?tab=grupos')
      await user.click(screen.getByRole('button', { name: 'Criar grupo' }))
      let dialog = screen.getByRole('dialog', { name: 'Criar grupo' })
      expect(within(dialog).queryByRole('switch', { name: 'Os participantes podem sair do grupo' })).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))

      chatMock.set({ session: readySession(makeMe({ publicId: 7, role: 'admin' })) })
      await user.click(screen.getByRole('button', { name: 'Criar grupo' }))
      dialog = screen.getByRole('dialog', { name: 'Criar grupo' })
      await user.type(within(dialog).getByRole('textbox', { name: 'Nome do grupo' }), 'Viagem')
      await user.click(within(dialog).getByRole('switch', { name: 'Os participantes podem sair do grupo' }))
      await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
      expect(groupActions.createGroup).toHaveBeenCalledWith({ name: 'Viagem', memberPublicIds: [], allowLeave: false })
    })
  })
})
