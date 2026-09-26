import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useSettingsStore } from '@/stores/settingsStore'
import { chatMock } from '@/pages/chat/testFixtures'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
// The navs import the store-only hook module directly (keeps supabase-js out of the entry chunk).
vi.mock('@/hooks/chat/useUnreadCounts', async () => ({ useUnreadCounts: (await import('@/pages/chat/testFixtures')).chatHooksMock.useUnreadCounts }))

function renderNavs(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <BottomNav />
        <SideNav />
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  useSettingsStore.setState({ appLanguage: 'pt-PT' })
  await loadMessages('pt-PT')
})

beforeEach(() => chatMock.reset())

describe('navigation', () => {
  it('Chat replaces Tradutor and keeps Conversar as the centre button', () => {
    renderNavs()
    const [bottom] = screen.getAllByRole('navigation', { name: 'Navegação principal' })
    const links = within(bottom as HTMLElement).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/chat', '/talk', '/settings', '/profile'])
    expect(within(bottom as HTMLElement).queryByText('Tradutor')).not.toBeInTheDocument()
    expect(within(bottom as HTMLElement).getByRole('link', { name: 'Conversar' })).toHaveClass('bg-grad')
  })

  it('shows the total unread count on Chat (99+ cap) in both navs', () => {
    chatMock.set({ unread: { total: 120, direct: 100, groups: 20 } })
    renderNavs('/chat/c1')
    const chatLinks = screen.getAllByRole('link', { name: /^Chat, 120 mensagens não lidas$/ })
    expect(chatLinks).toHaveLength(2)
    for (const link of chatLinks) {
      expect(within(link).getByText('99+')).toBeInTheDocument()
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })
})
