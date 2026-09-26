import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock, notifications } from '../testFixtures'
import { ChatNotificationsBridge } from './ChatNotificationsBridge'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

function Probe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderBridge(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <ChatNotificationsBridge activeConversationId={null} />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const notify = (notice: IncomingMessageNotice) => act(() => notifications.onNotice?.(notice))

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => chatMock.reset())

describe('ChatNotificationsBridge', () => {
  it('labels group notices clearly and opens the conversation on tap', async () => {
    renderBridge('/')
    notify({ conversationId: 'g1', kind: 'group', title: 'Erasmus Milão', senderName: 'Ana', preview: 'Olá a todos', audioDurationMs: null })
    const banner = screen.getByRole('button', { name: 'Grupo · Erasmus Milão: Ana: Olá a todos' })
    expect(screen.getByText('Grupo · Erasmus Milão')).toBeInTheDocument()
    await userEvent.setup().click(banner)
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/g1')
    expect(screen.queryByRole('button', { name: /Grupo ·/ })).not.toBeInTheDocument()
  })

  it('direct notices read "{name}: {message}" and voice messages show their duration', async () => {
    renderBridge('/profile')
    notify({ conversationId: 'd1', kind: 'direct', title: 'João', senderName: 'João', preview: null, audioDurationMs: 12_000 })
    expect(screen.getByRole('button', { name: 'João: Áudio 0:12' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar notificação' }))
    expect(screen.queryByRole('button', { name: 'João: Áudio 0:12' })).not.toBeInTheDocument()
  })

  it('stays quiet on the Chat list (it updates live)', () => {
    renderBridge('/chat')
    notify({ conversationId: 'd1', kind: 'direct', title: 'João', senderName: 'João', preview: 'Olá', audioDurationMs: null })
    expect(screen.queryByRole('button', { name: 'João: Olá' })).not.toBeInTheDocument()
  })
})
