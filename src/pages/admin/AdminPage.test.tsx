import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import type { AdminUserRow } from '@/services/chat/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { adminState, chatMock, makeMe, MONITOR, readySession } from '@/pages/chat/testFixtures'
import AdminPage from './AdminPage'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)

// canManageGroups no longer means anything (group rights are per group): even `true` shows nothing.
const pendingMonitor: AdminUserRow = { id: 'u-m2', publicId: 4, displayName: 'Marta Reis', role: 'monitor', avatarPath: null, monitorStatus: 'pending', canManageGroups: true, monitor: null }
const student: AdminUserRow = { id: 'u-s', publicId: 12, displayName: 'Ana Costa', role: 'student', avatarPath: null, monitorStatus: null, canManageGroups: false, monitor: MONITOR }

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <I18nProvider>
        <ToastProvider>
          <AdminPage />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => {
  chatMock.reset()
})

describe('AdminPage', () => {
  it('refuses non-admins', () => {
    chatMock.set({ session: readySession(makeMe({ role: 'monitor', monitorStatus: 'verified' })) })
    renderAdmin()
    expect(screen.getByRole('alert')).toHaveTextContent('Sem acesso')
  })

  it('lists users, searches and verifies a monitor', async () => {
    const user = userEvent.setup()
    const admin = adminState({ items: [pendingMonitor, student] })
    chatMock.set({ session: readySession(makeMe({ role: 'admin' })), admin })
    renderAdmin()

    expect(screen.getByText('Por verificar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marta Reis/ })).not.toHaveTextContent(/grupos/i)
    expect(screen.getByText('Monitor: João Pereira (ID: 03)')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar utilizadores' }), 'Marta')
    expect(admin.search).toHaveBeenLastCalledWith('Marta')

    await user.click(screen.getByRole('button', { name: /Marta Reis/ }))
    const sheet = screen.getByRole('dialog', { name: 'Marta Reis' })
    // Only the verification switch: no "Pode gerir grupos".
    expect(within(sheet).getAllByRole('switch')).toHaveLength(1)
    await user.click(within(sheet).getByRole('switch', { name: /Conta de monitor verificada/ }))
    expect(admin.verifyMonitor).toHaveBeenCalledWith('u-m2', true)
    await user.click(within(sheet).getByRole('button', { name: 'Mudar para aluno' }))
    expect(admin.setRole).toHaveBeenCalledWith('u-m2', 'student')
  })

  it('assigns a student to a monitor by IDs', async () => {
    const user = userEvent.setup()
    const admin = adminState({ items: [student] })
    chatMock.set({ session: readySession(makeMe({ role: 'admin' })), admin })
    renderAdmin()
    await user.type(screen.getByRole('textbox', { name: 'ID do aluno' }), '12')
    await user.type(screen.getByRole('textbox', { name: 'ID do monitor' }), 'ID 3')
    await user.click(screen.getByRole('button', { name: 'Associar' }))
    expect(admin.setStudentMonitor).toHaveBeenCalledWith(12, 3)
    expect(await screen.findByText('Alterações guardadas')).toBeInTheDocument()
  })
})
