import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  groupActions,
  listState,
  makeDirect,
  makeGroup,
  makeMe,
  MONITOR,
  readySession,
  STUDENT_ANA,
  studentAssociation,
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

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
})

describe('ChatPage', () => {
  it('shows the header and tabs at once, with a skeleton while connecting', () => {
    chatMock.set({ session: { status: 'connecting', me: null, error: null, retry: vi.fn() } })
    renderChat()
    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Conversas/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Grupos/ })).toBeInTheDocument()
    expect(screen.getByText('A ligar ao chat…')).toBeInTheDocument()
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

  it('lists direct conversations with role, "Tu:" prefix, audio preview and a capped unread badge', () => {
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
    expect(first).toHaveAccessibleName(/João Pereira, Monitor, 150 mensagens não lidas, Última mensagem: Áudio 0:12, 09:05/)
    expect(within(first).getByText('99+')).toBeInTheDocument()
    expect(within(first).getByText('Áudio 0:12')).toBeInTheDocument()

    const second = screen.getByRole('link', { name: /^Ana Costa/ })
    expect(within(second).getByText('Tu:')).toBeInTheDocument()
    expect(within(second).getByText('Aluno')).toBeInTheDocument()
    // Tab counter
    expect(screen.getByRole('tab', { name: /Conversas, 150 mensagens não lidas/ })).toBeInTheDocument()
  })

  it('syncs the tab with ?tab= and shows groups with sender names and participants', async () => {
    const user = userEvent.setup()
    chatMock.set({
      session: readySession(makeMe()),
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
    await user.click(screen.getByRole('tab', { name: /Grupos/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/chat?tab=grupos')
    const row = screen.getByRole('link', { name: /^Erasmus Milão, 12 participantes, 2 mensagens não lidas, Última mensagem: João: Reunião às 5/ })
    expect(row).toHaveAttribute('href', '/chat/g1')
    // Students cannot create groups.
    expect(screen.queryByRole('button', { name: 'Criar grupo' })).not.toBeInTheDocument()
  })

  it('student without a monitor sees their ID big with a copy button', async () => {
    const user = userEvent.setup() // installs a clipboard stub
    chatMock.set({ session: readySession(makeMe({ publicId: 7 })) })
    renderChat()
    expect(screen.getByRole('heading', { name: 'Ainda não tens monitor' })).toBeInTheDocument()
    expect(screen.getByText('ID 07')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copiar o teu ID (ID 07)' }))
    expect(await navigator.clipboard.readText()).toBe('ID 07')
    expect(await screen.findByText('ID copiado')).toBeInTheDocument()
  })

  it('pending monitors see the verification banner and no "Adicionar aluno"', () => {
    chatMock.set({ session: readySession(makeMe({ role: 'monitor', monitorStatus: 'pending' })) })
    renderChat()
    expect(screen.getByText('Conta de monitor por verificar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar aluno' })).not.toBeInTheDocument()
  })

  it('verified monitor adds a student by ID and lands in the new conversation', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe({ role: 'monitor', monitorStatus: 'verified' })) })
    renderChat()
    await user.click(screen.getByRole('button', { name: 'Adicionar aluno' }))
    const dialog = screen.getByRole('dialog', { name: 'Adicionar aluno' })
    const field = within(dialog).getByRole('textbox', { name: 'ID do aluno' })
    expect(field).toHaveFocus()

    // Invalid input, then not found, then found.
    await user.type(field, 'abc{Enter}')
    expect(within(dialog).getByText('Escreve um ID válido, por exemplo 07.')).toBeInTheDocument()
    studentAssociation.lookupStudent.mockRejectedValueOnce(new AppError('not-found'))
    await user.clear(field)
    await user.type(field, 'ID 99{Enter}')
    expect(await within(dialog).findByText('Não encontrámos ninguém com esse ID')).toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Procurar' }))

    expect(await within(dialog).findByText('Ana Costa')).toBeInTheDocument()
    expect(studentAssociation.lookupStudent).toHaveBeenLastCalledWith(12)
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar e abrir conversa' }))
    expect(studentAssociation.associateStudent).toHaveBeenCalledWith(12)
    expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-new')
  })

  it('shows "already associated" from the server inside the sheet', async () => {
    const user = userEvent.setup()
    studentAssociation.associateStudent.mockRejectedValueOnce(Object.assign(new AppError('invalid-input'), { chatCode: 'already_associated' }))
    chatMock.set({ session: readySession(makeMe({ role: 'monitor', monitorStatus: 'verified' })) })
    renderChat()
    await user.click(screen.getByRole('button', { name: 'Adicionar aluno' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), '12{Enter}')
    await user.click(await within(dialog).findByRole('button', { name: 'Adicionar e abrir conversa' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esse ID já tem um monitor associado.')
  })

  it('managers create a group with participants', async () => {
    const user = userEvent.setup()
    chatMock.set({ session: readySession(makeMe({ role: 'monitor', monitorStatus: 'verified', canManageGroups: true })) })
    renderChat('/chat?tab=grupos')
    await user.click(screen.getByRole('button', { name: 'Criar grupo' }))
    const dialog = screen.getByRole('dialog', { name: 'Criar grupo' })

    // Name required.
    await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))
    expect(within(dialog).getByText('Dá um nome ao grupo.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: 'Nome do grupo' }), '  Turma   de março {Enter}')
    await user.type(within(dialog).getByRole('textbox', { name: 'ID do participante' }), '12{Enter}')
    expect(await within(dialog).findByText('Ana Costa')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Criar grupo' }))

    expect(groupActions.createGroup).toHaveBeenCalledWith({ name: 'Turma de março', memberPublicIds: [12], allowLeave: true })
    expect(await screen.findByText('conversation-screen')).toBeInTheDocument()
  })
})
