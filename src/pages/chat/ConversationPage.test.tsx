import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
  directChats,
  groupActions,
  makeDirect,
  makeGroup,
  makeMe,
  member,
  MONITOR,
  person,
  readySession,
  STUDENT_ANA,
  textMessage,
} from './testFixtures'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/chat/avatars', () => ({ avatarUrl: (path: string | null | undefined) => (path ? `https://cdn.test/${path}` : null) }))

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
const BRUNO = person('u-bruno', 21, 'Bruno Lima', 'student')
const PLATFORM_ADMIN = person('u-adm', 1, 'Carla Nunes', 'admin')
const groupMessages = [
  textMessage('m1', MONITOR.id, 'Bem-vindos ao grupo!', day(-1, 18)),
  textMessage('m2', 'u-me', 'Obrigada 🙂', day(0, 9, 5), { status: 'read' }),
  textMessage('m3', STUDENT_ANA.id, 'Olá a todos', day(0, 9, 7)),
]

/** Chat error as thrown by the data layer (AppError + chat reason). */
const chatError = (chatCode: string) => Object.assign(new AppError('permission-denied'), { chatCode })

/** I am an administrator ('manager') of the group, with a plain member, another administrator and a platform admin. */
function asGroupAdmin(extra: Parameters<typeof conversationState>[0] = {}) {
  const admin = makeMe({ id: 'u-me', role: 'student' })
  chatMock.set({
    session: readySession(admin),
    conversation: conversationState({
      conversation: makeGroup({ myRole: 'manager', membersCount: 4 }),
      members: [member(admin, 'manager'), member(STUDENT_ANA), member(MONITOR, 'manager'), member(PLATFORM_ADMIN)],
      messages: [],
      ...extra,
    }),
  })
}

async function openGroupInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Informações do grupo' }))
  return screen.getByRole('dialog', { name: 'Erasmus Milão' })
}

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
  it('renders a group conversation grouped by day with "Nome · ID" authors, role pills and delivery state', () => {
    renderConversation()
    expect(screen.getByRole('button', { name: 'Informações do grupo: Erasmus Milão, 3 participantes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Ontem' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Hoje' })).toBeInTheDocument()

    const incoming = screen.getByText('Bem-vindos ao grupo!').closest('li') as HTMLElement
    expect(within(incoming).getByText('João Pereira · 03')).toBeInTheDocument()
    expect(within(incoming).getByText('Monitor')).toBeInTheDocument()
    const fromAna = screen.getByText('Olá a todos').closest('li') as HTMLElement
    expect(within(fromAna).getByText('Ana Costa · 12')).toBeInTheDocument()

    const mine = screen.getByText('Obrigada 🙂').closest('li') as HTMLElement
    expect(within(mine).getByRole('img', { name: 'Lida' })).toBeInTheDocument()
    expect(within(mine).queryByText('Aluno')).not.toBeInTheDocument()
    expect(within(mine).queryByText(/·/)).not.toBeInTheDocument()
    expect(chatMock.get().conversation.markRead).toHaveBeenCalled()
  })

  it('shows the author once per run of consecutive messages from the same person', () => {
    const current = chatMock.get().conversation
    chatMock.set({ conversation: { ...current, messages: [...groupMessages, textMessage('m4', STUDENT_ANA.id, 'Alguém vem ao jantar?', day(0, 9, 8))] } })
    renderConversation()
    const follow = screen.getByText('Alguém vem ao jantar?').closest('li') as HTMLElement
    expect(within(follow).queryByText('Ana Costa · 12')).not.toBeInTheDocument()
    // Screen readers still hear who wrote it.
    expect(within(follow).getByText('Ana Costa:')).toHaveClass('sr-only')
    expect(screen.getAllByText('Ana Costa · 12')).toHaveLength(1)
  })

  it('direct header shows the other person with role pill and public ID', () => {
    chatMock.set({ conversation: conversationState({ conversation: makeDirect({ id: 'c-direct', otherUser: MONITOR }), messages: [] }) })
    renderConversation('c-direct')
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { level: 1, name: 'João Pereira' })).toBeInTheDocument()
    expect(within(header).getByText('João Pereira', { selector: 'p' })).toBeInTheDocument()
    expect(within(header).getByText('Monitor')).toBeInTheDocument()
    expect(within(header).getByText('ID: 03')).toBeInTheDocument()
    expect(screen.getByText('Ainda não há mensagens. Diz olá!')).toBeInTheDocument()
  })

  it('failed messages say so clearly and offer retry and discard', async () => {
    const user = userEvent.setup()
    const conv = conversationState({
      conversation: makeDirect({ id: 'c-direct' }),
      messages: [textMessage('m9', 'u-me', 'Não chegou', day(0, 10), { status: 'failed' })],
    })
    chatMock.set({ conversation: conv })
    renderConversation('c-direct')
    const bubble = screen.getByText('Não chegou').closest('li') as HTMLElement
    expect(within(bubble).getByText('Não foi possível enviar a mensagem. Tenta novamente.')).toBeInTheDocument()
    expect(within(bubble).getByRole('img', { name: 'Não enviada' })).toBeInTheDocument()
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

  it('group info for a member: participants with "Administrador"/"Tu" pills, no management actions', async () => {
    const user = userEvent.setup()
    renderConversation()
    const info = await openGroupInfo(user)
    expect(within(info).getByText('3 participantes')).toBeInTheDocument()
    expect(within(info).getByText('Os administradores gerem os participantes, o nome e a foto do grupo.')).toBeInTheDocument()

    const joao = within(info).getByRole('button', { name: /João Pereira/ })
    expect(joao).toHaveTextContent('03')
    expect(joao).toHaveTextContent('Monitor')
    expect(joao).toHaveTextContent('Administrador')
    expect(within(info).getByRole('button', { name: /Ana Costa/ })).not.toHaveTextContent('Administrador')
    // My own row is not a button and says "Tu".
    expect(within(info).queryByRole('button', { name: /Rita Sousa/ })).not.toBeInTheDocument()
    expect(within(info).getByText('Tu')).toBeInTheDocument()

    for (const name of ['Adicionar membro', 'Mudar o nome', 'Arquivar grupo', 'Apagar grupo', 'Adicionar uma foto ao grupo']) {
      expect(within(info).queryByRole('button', { name: new RegExp(name) })).not.toBeInTheDocument()
    }
  })

  it('any participant can open a direct conversation with another member; plain members see no admin options', async () => {
    const user = userEvent.setup()
    renderConversation()
    const info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: /Ana Costa/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Opções para Ana Costa' })
    expect(within(sheet).getByText('ID: 12')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Tornar administrador' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Remover do grupo' })).not.toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Enviar mensagem a Ana Costa' }))
    expect(directChats.startDirectConversation).toHaveBeenCalledWith(12)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/chat/c-new'))
    expect(await screen.findByRole('textbox', { name: 'Mensagem' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('group info: members can leave after confirming (errors stay in the sheet)', async () => {
    const user = userEvent.setup()
    renderConversation()
    const info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: 'Sair do grupo' }))
    const confirm = await screen.findByRole('dialog', { name: 'Sair do grupo?' })
    groupActions.leaveGroup.mockRejectedValueOnce(chatError('not_allowed'))
    await user.click(within(confirm).getByRole('button', { name: 'Sair do grupo' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Não tens permissão para fazer isto.')

    await user.click(within(confirm).getByRole('button', { name: 'Sair do grupo' }))
    expect(groupActions.leaveGroup).toHaveBeenLastCalledWith('c-group')
    expect(await screen.findByText('chat-list')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/chat?tab=grupos')
  })

  it('group administrators promote and demote administrators ("last_manager" is explained)', async () => {
    const user = userEvent.setup()
    asGroupAdmin()
    renderConversation()
    let info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: /Ana Costa/ }))
    let sheet = await screen.findByRole('dialog', { name: 'Opções para Ana Costa' })
    await user.click(within(sheet).getByRole('button', { name: 'Tornar administrador' }))
    expect(groupActions.setMemberRole).toHaveBeenCalledWith('c-group', STUDENT_ANA.id, 'manager')
    expect(await screen.findByText('Ana Costa é agora administrador do grupo')).toBeInTheDocument()

    info = await screen.findByRole('dialog', { name: 'Erasmus Milão' })
    await user.click(within(info).getByRole('button', { name: /João Pereira/ }))
    sheet = await screen.findByRole('dialog', { name: 'Opções para João Pereira' })
    groupActions.setMemberRole.mockRejectedValueOnce(chatError('last_manager'))
    await user.click(within(sheet).getByRole('button', { name: 'Retirar administrador' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('O grupo precisa de pelo menos um administrador.')
    expect(groupActions.setMemberRole).toHaveBeenLastCalledWith('c-group', MONITOR.id, 'member')

    await user.click(within(sheet).getByRole('button', { name: 'Retirar administrador' }))
    expect(await screen.findByText('João Pereira deixou de ser administrador do grupo')).toBeInTheDocument()
  })

  it('group administrators remove participants after confirming, but not a platform admin', async () => {
    const user = userEvent.setup()
    asGroupAdmin()
    renderConversation()
    let info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: /Carla Nunes/ }))
    let sheet = await screen.findByRole('dialog', { name: 'Opções para Carla Nunes' })
    expect(within(sheet).queryByRole('button', { name: 'Remover do grupo' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Fechar' }))

    info = await screen.findByRole('dialog', { name: 'Erasmus Milão' })
    await user.click(within(info).getByRole('button', { name: /João Pereira/ }))
    sheet = await screen.findByRole('dialog', { name: 'Opções para João Pereira' })
    await user.click(within(sheet).getByRole('button', { name: 'Remover do grupo' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remover do grupo?' })
    expect(confirm).toHaveTextContent('João Pereira deixa de ter acesso a este grupo e às mensagens.')
    await user.click(within(confirm).getByRole('button', { name: 'Remover' }))
    expect(groupActions.removeMember).toHaveBeenCalledWith('c-group', MONITOR.id)
    expect(await screen.findByText('João Pereira já não faz parte do grupo')).toBeInTheDocument()
  })

  it('"Adicionar membro" searches people like "Adicionar pessoa" and adds them (optionally as administrator)', async () => {
    const user = userEvent.setup()
    asGroupAdmin()
    chatMock.set({ directory: [STUDENT_ANA, BRUNO] })
    renderConversation()
    const info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: 'Adicionar membro' }))
    const add = await screen.findByRole('dialog', { name: 'Adicionar membro' })
    const field = within(add).getByRole('searchbox', { name: 'Introduzir ID' })
    expect(field).toHaveFocus()

    // People already in the group are listed greyed out, without an add button.
    await user.type(field, 'Ana')
    const ana = within(add).getByRole('group', { name: /Ana Costa/ })
    expect(ana).toHaveTextContent('Essa pessoa já faz parte do grupo.')
    expect(within(ana).queryByRole('button')).not.toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'Bruno')
    await user.click(within(add).getByRole('switch', { name: /Também é administrador do grupo/ }))
    await user.click(within(add).getByRole('button', { name: 'Adicionar Bruno Lima ao grupo' }))
    expect(groupActions.addMember).toHaveBeenCalledWith('c-group', 21, true)
    expect(await screen.findByText('Bruno Lima já faz parte do grupo')).toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'Erasmus Milão' })).toBeInTheDocument()
  })

  it('"Adicionar membro": Enter adds the exact ID match; server errors stay in the sheet', async () => {
    const user = userEvent.setup()
    asGroupAdmin()
    chatMock.set({ directory: [BRUNO] })
    renderConversation()
    const info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: 'Adicionar membro' }))
    const add = await screen.findByRole('dialog', { name: 'Adicionar membro' })
    groupActions.addMember.mockRejectedValueOnce(chatError('archived'))
    await user.type(within(add).getByRole('searchbox', { name: 'Introduzir ID' }), 'ID: 21{Enter}')
    expect(groupActions.addMember).toHaveBeenCalledWith('c-group', 21, false)
    expect(await within(add).findByRole('alert')).toHaveTextContent('Esta conversa está arquivada.')
  })

  it('group without other members says so and offers "Adicionar membro" to administrators', async () => {
    const user = userEvent.setup()
    asGroupAdmin({ conversation: makeGroup({ myRole: 'manager', membersCount: 1 }), members: [member(me, 'manager')] })
    renderConversation()
    const info = await openGroupInfo(user)
    expect(within(info).getByText('Ainda não existem membros neste grupo.')).toBeInTheDocument()
    expect(within(info).getByRole('button', { name: 'Adicionar membro' })).toBeInTheDocument()
  })

  it('group administrators change and remove the group photo', async () => {
    const user = userEvent.setup()
    asGroupAdmin()
    renderConversation()
    let info = await openGroupInfo(user)
    await user.click(within(info).getByRole('button', { name: 'Adicionar uma foto ao grupo' }))
    let sheet = await screen.findByRole('dialog', { name: 'Foto do grupo' })
    expect(within(sheet).queryByRole('button', { name: 'Remover a foto do grupo' })).not.toBeInTheDocument()
    const file = new File(['png'], 'grupo.png', { type: 'image/png' })
    await user.upload(sheet.querySelector('input[type="file"]') as HTMLInputElement, file)
    expect(groupActions.setGroupAvatar).toHaveBeenCalledWith('c-group', file)
    expect(await screen.findByText('Foto do grupo atualizada')).toBeInTheDocument()

    act(() => {
      const current = chatMock.get().conversation
      chatMock.set({ conversation: { ...current, conversation: makeGroup({ myRole: 'manager', membersCount: 4, avatarPath: 'groups/c-group/a.jpg' }) } })
    })
    info = await screen.findByRole('dialog', { name: 'Erasmus Milão' })
    expect(info.querySelector('img[src="https://cdn.test/groups/c-group/a.jpg"]')).not.toBeNull()
    await user.click(within(info).getByRole('button', { name: 'Mudar a foto do grupo' }))
    sheet = await screen.findByRole('dialog', { name: 'Foto do grupo' })
    await user.click(within(sheet).getByRole('button', { name: 'Remover a foto do grupo' }))
    expect(groupActions.setGroupAvatar).toHaveBeenLastCalledWith('c-group', null)
    expect(await screen.findByText('Foto do grupo removida')).toBeInTheDocument()
  })
})
