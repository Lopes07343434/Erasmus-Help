import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { chatMock, makeMe, readySession } from '@/pages/chat/testFixtures'
import { AppError } from '@/services/errors'
import { usePushSyncStore } from '@/services/notifications/syncState'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePushSync } from './usePushSync'

const mocks = vi.hoisted(() => ({
  pushConfigured: true,
  subscribeToPush: vi.fn(async () => ({}) as PushSubscription),
}))

vi.mock('@/hooks/chat', async () => (await import('@/pages/chat/testFixtures')).chatHooksMock)
vi.mock('@/services/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/notifications')>()),
  isPushConfigured: () => mocks.pushConfigured,
  subscribeToPush: mocks.subscribeToPush,
}))

function stubPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', class { static permission = permission })
}

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

beforeAll(async () => {
  await loadMessages('pt-PT')
  await loadMessages('pl')
})

beforeEach(() => {
  chatMock.reset()
  chatMock.set({ session: readySession(makeMe()) })
  mocks.pushConfigured = true
  mocks.subscribeToPush.mockReset()
  mocks.subscribeToPush.mockResolvedValue({} as PushSubscription)
  usePushSyncStore.setState({ status: 'idle', attempt: 0 })
  useSettingsStore.setState({ appLanguage: 'pt-PT', notificationsEnabled: true })
  stubPermission('granted')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePushSync', () => {
  it('registers the device in the language chosen by the user', async () => {
    renderHook(() => usePushSync(), { wrapper })
    await waitFor(() => expect(usePushSyncStore.getState().status).toBe('registered'))
    expect(mocks.subscribeToPush).toHaveBeenCalledWith({ locale: 'pt-PT' })
  })

  it('registers again when the app language changes', async () => {
    renderHook(() => usePushSync(), { wrapper })
    await waitFor(() => expect(mocks.subscribeToPush).toHaveBeenCalledTimes(1))
    useSettingsStore.setState({ appLanguage: 'pl' })
    await waitFor(() => expect(mocks.subscribeToPush).toHaveBeenCalledWith({ locale: 'pl' }))
  })

  it.each([
    ['the browser permission is not granted', () => stubPermission('default')],
    ['the user turned notifications off', () => useSettingsStore.setState({ notificationsEnabled: false })],
    ['the chat account does not exist yet', () => chatMock.set({ session: { ...readySession(makeMe()), status: 'connecting', me: null } })],
    ['the build has no push configuration', () => { mocks.pushConfigured = false }],
  ])('does nothing when %s', async (_name, arrange) => {
    arrange()
    renderHook(() => usePushSync(), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.subscribeToPush).not.toHaveBeenCalled()
    expect(usePushSyncStore.getState().status).toBe('idle')
  })

  it('reports a failure and retries when asked', async () => {
    mocks.subscribeToPush.mockRejectedValueOnce(new AppError('unavailable'))
    renderHook(() => usePushSync(), { wrapper })
    await waitFor(() => expect(usePushSyncStore.getState().status).toBe('failed'))
    usePushSyncStore.getState().retry()
    await waitFor(() => expect(usePushSyncStore.getState().status).toBe('registered'))
    expect(mocks.subscribeToPush).toHaveBeenCalledTimes(2)
  })

  it('stays idle (not failed) when push is not configured on the server side', async () => {
    mocks.subscribeToPush.mockRejectedValueOnce(new AppError('not-configured'))
    renderHook(() => usePushSync(), { wrapper })
    await waitFor(() => expect(mocks.subscribeToPush).toHaveBeenCalled())
    await waitFor(() => expect(usePushSyncStore.getState().status).toBe('idle'))
  })
})
