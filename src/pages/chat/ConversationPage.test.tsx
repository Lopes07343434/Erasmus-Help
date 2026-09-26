import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { AppError } from '@/services/errors'
import { useSettingsStore } from '@/stores/settingsStore'
import ConversationPage from './ConversationPage'
import {
  chatMock,
  conversationState,
  groupActions,
  makeDirect,
  makeGroup,
  makeMe,
  member,
  MONITOR,
  readySession,
  STUDENT_ANA,
  textMessage,
} from './testFixtures'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

let finePointer = true

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderConversation(id = 'c-group') {
  return render(
    <MemoryRouter initialEntries={[`/chat/${id}`]}>
      <I18nProvider>
        <ToastProvider>
          <Routes>
            <Route path="/chat/:conversationId" element={<ConversationPage />} />
            <Route path="/chat" element={<p>chat-list</p>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const now = new Date()
const day = (offset: number, h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m).toISOString()

const me = makeMe({ id: 'u-me', role: 'student' })
const groupMessages = [
  textMessage('m1', MONITOR.id, 'Bem-vindos ao grupo!', day(-1, 18)),
  textMessage('m2', 'u-me', 'Obrigada 🙂', day(0, 9, 5), { status: 'read' }),
  textMessage('m3', STUDENT_ANA.id, 'Olá a todos', day(0, 9, 7)),
]

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
  finePointer = true
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: fine') ? finePointer : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.scrollBy = vi.fn() as unknown as typeof window.scrollBy
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  chatMock.set({
    session: readySession(me),
    conversation: conversationState({
      conversation: makeGroup({ id: 'c-group', membersCount: 3 }),
      members: [member(MONITOR, 'manager'), member(STUDENT_ANA), member(me)],
      messages: groupMessages,
      senders: { [MONITOR.id]: MONITOR, [STUDENT_ANA.id]: STUDENT_ANA, [me.id]: me },
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ConversationPage', () => {
  it('renders a group conversation grouped by day with sender names, role pills and delivery state', () => {
    renderConversation()
    expect(screen.getByRole('button', { name: 'Detalhes do grupo: Erasmus Milão, 3 participantes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Ontem' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Hoje' })).toBeInTheDocument()

    const incoming = screen.getByText('Bem-vindos ao grupo!').closest('li')
    expect(incoming).not.toBeNull()
    expect(within(incoming as HTMLElement).getByText('João Pereira')).toBeInTheDocument()
    expect(within(incoming as HTMLElement).getByText('Monitor')).toBeInTheDocument()

    const mine = screen.getByText('Obrigada 🙂').closest('li') as HTMLElement
    expect(within(mine).getByRole('img', { name: 'Lida' })).toBeInTheDocument()
    expect(within(mine).queryByText('Aluno')).not.toBeInTheDocument()
    expect(chatMock.get().conversation.markRead).toHaveBeenCalled()
  })

  it('direct header shows the other person with role pill and public ID', () => {
    chatMock.set({ conversation: conversationState({ conversation: makeDirect({ id: 'c-direct', otherUser: MONITOR }), messages: [] }) })
    renderConversation('c-direct')
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { level: 1, name: 'João Pereira' })).toBeInTheDocument()
    expect(within(header).getByText('João Pereira', { selector: 'p' })).toBeInTheDocument()
    expect(within(header).getByText('Monitor')).toBeInTheDocument()
    expect(within(header).getByText('ID 03')).toBeInTheDocument()
    expect(screen.getByText('Ainda não há mensagens. Diz olá!')).toBeInTheDocument()
  })

  it('failed messages offer retry and discard', async () => {
    const user = userEvent.setup()
    const conv = conversationState({
      conversation: makeDirect({ id: 'c-direct' }),
      messages: [textMessage('m9', 'u-me', 'Não chegou', day(0, 10), { status: 'failed' })],
    })
    chatMock.set({ conversation: conv })
    renderConversation('c-direct')
    expect(screen.getAllByText('Não enviada').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(conv.retry).toHaveBeenCalledWith('m9')
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(conv.discard).toHaveBeenCalledWith('m9')
  })

  it('desktop: Enter sends, Shift+Enter adds a line', async () => {
    const user = userEvent.setup()
    renderConversation()
    const field = screen.getByRole('textbox', { name: 'Mensagem' })
    expect(screen.getByRole('button', { name: 'Gravar mensagem de voz' })).toBeInTheDocument()
    await user.type(field, 'Linha 1{Shift>}{Enter}{/Shift}Linha 2')
    expect(field).toHaveValue('Linha 1\nLinha 2')
    expect(screen.queryByRole('button', { name: 'Gravar mensagem de voz' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(chatMock.get().conversation.sendText).toHaveBeenCalledWith('Linha 1\nLinha 2')
    expect(field).toHaveValue('')
  })

  it('touch: Enter is a new line and the send button sends', async () => {
    finePointer = false
    const user = userEvent.setup()
    renderConversation()
    const field = screen.getByRole('textbox', { name: 'Mensagem' })
    await user.type(field, 'Olá{Enter}')
    expect(chatMock.get().conversation.sendText).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    expect(chatMock.get().conversation.sendText).toHaveBeenCalledWith('Olá\n')
  })

  it('archived conversations are read-only', () => {
    chatMock.set({ conversation: conversationState({ conversation: makeGroup({ archivedAt: day(0, 8) }), messages: groupMessages, senders: { [MONITOR.id]: MONITOR } }) })
    renderConversation()
    expect(screen.getByText('Esta conversa está arquivada. Podes ler as mensagens, mas não enviar novas.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Mensagem' })).not.toBeInTheDocument()
  })

  it('shows "not found" with a way back', async () => {
    chatMock.set({ conversation: conversationState({ status: 'not-found', conversation: null }) })
    renderConversation('c-gone')
    expect(screen.getByText('Conversa não encontrada')).toBeInTheDocument()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Voltar ao Chat' }).at(-1) as HTMLElement)
    expect(await screen.findByText('chat-list')).toBeInTheDocument()
  })

  it('announces new incoming messages (only those) to screen readers', () => {
    renderConversation()
    const log = screen.getByRole('log')
    expect(log).toBeEmptyDOMElement()
    act(() => {
      const current = chatMock.get().conversation
      chatMock.set({ conversation: { ...current, messages: [...groupMessages, textMessage('m4', MONITOR.id, 'Amanhã às 10h', day(0, 11))] } })
    })
    expect(log).toHaveTextContent('Nova mensagem de João Pereira: Amanhã às 10h')
  })

  it('group info: members see participants and can leave after confirming', async () => {
    const user = userEvent.setup()
    renderConversation()
    await user.click(screen.getByRole('button', { name: 'Detalhes do grupo' }))
    const info = screen.getByRole('dialog', { name: 'Erasmus Milão' })
    expect(within(info).getByText('Gestor')).toBeInTheDocument()
    expect(within(info).queryByRole('button', { name: /^Remover/ })).not.toBeInTheDocument()
    expect(within(info).queryByRole('button', { name: 'Mudar o nome' })).not.toBeInTheDocument()

    await user.click(within(info).getByRole('button', { name: 'Sair do grupo' }))
    const confirm = await screen.findByRole('dialog', { name: 'Sair do grupo?' })
    groupActions.leaveGroup.mockRejectedValueOnce(Object.assign(new AppError('permission-denied'), { chatCode: 'last_manager' }))
    await user.click(within(confirm).getByRole('button', { name: 'Sair do grupo' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('És a única pessoa que gere este grupo.')

    await user.click(within(confirm).getByRole('button', { name: 'Sair do grupo' }))
    expect(groupActions.leaveGroup).toHaveBeenLastCalledWith('c-group')
    expect(await screen.findByText('chat-list')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/chat?tab=grupos')
  })

  it('group info: managers can add (by ID) and remove participants', async () => {
    const user = userEvent.setup()
    const manager = makeMe({ id: 'u-me', role: 'monitor', monitorStatus: 'verified', canManageGroups: true })
    chatMock.set({
      session: readySession(manager),
      conversation: conversationState({
        conversation: makeGroup({ myRole: 'manager' }),
        members: [member(manager, 'manager'), member(STUDENT_ANA)],
        messages: [],
      }),
    })
    renderConversation()
    await user.click(screen.getByRole('button', { name: 'Detalhes do grupo' }))
    let info = screen.getByRole('dialog', { name: 'Erasmus Milão' })

    await user.click(within(info).getByRole('button', { name: 'Remover Ana Costa do grupo' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remover do grupo?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remover' }))
    expect(groupActions.removeMember).toHaveBeenCalledWith('c-group', STUDENT_ANA.id)

    info = await screen.findByRole('dialog', { name: 'Erasmus Milão' })
    await user.click(within(info).getByRole('button', { name: 'Adicionar participante' }))
    const add = await screen.findByRole('dialog', { name: 'Adicionar participante' })
    groupActions.lookupByPublicId.mockResolvedValueOnce({ id: 'u-new', publicId: 21, displayName: 'Bruno Lima', role: 'student', avatarPath: null })
    await user.type(within(add).getByRole('textbox', { name: 'ID' }), 'id 21{Enter}')
    expect(await within(add).findByText('Bruno Lima')).toBeInTheDocument()
    await user.click(within(add).getByRole('switch', { name: /Também pode gerir o grupo/ }))
    await user.click(within(add).getByRole('button', { name: 'Adicionar ao grupo' }))
    expect(groupActions.lookupByPublicId).toHaveBeenCalledWith(21)
    expect(groupActions.addMember).toHaveBeenCalledWith('c-group', 21, true)
  })
})
