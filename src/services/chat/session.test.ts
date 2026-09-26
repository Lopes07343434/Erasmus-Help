import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatSession } from '@/hooks/chat'
import { useProfileStore } from '@/stores/profileStore'
import { useChatStore } from './chatStore'
import { getChatErrorDetail } from './errors'
import { PROFILE_SYNC_DEBOUNCE_MS, signOutChat } from './session'
import { ME, bootReady, createFakeSupabase, myProfileRow, okResult, onboardLocalProfile, resetChatTestState, type FakeSupabase } from './testUtils'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase
beforeEach(() => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  fake.rpc.list_my_conversations = () => okResult([])
})
afterEach(() => {
  resetChatTestState()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useChatSession', () => {
  it('is not-configured without VITE_SUPABASE_* and makes no request', async () => {
    h.client = null
    onboardLocalProfile()
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.status).toBe('not-configured'))
    expect(result.current.me).toBeNull()
    expect(result.current.error?.code).toBe('not-configured')
  })

  it('waits for the local onboarding, then signs in anonymously and creates the profile', async () => {
    fake.rpc.get_my_profile = () => okResult([])
    fake.rpc.upsert_my_profile = () => okResult(myProfileRow())
    const { result } = renderHook(() => useChatSession())
    await act(async () => {})
    expect(result.current.status).toBe('connecting')
    expect(fake.auth.getSession).not.toHaveBeenCalled()

    act(() => onboardLocalProfile())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fake.auth.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(fake.rpcCalls.find((c) => c.name === 'upsert_my_profile')?.args).toEqual({
      p_display_name: 'Ana',
      p_role: 'student',
      p_my_language: 'pt-PT',
      p_app_language: 'pt-PT',
      p_country_code: 'IT',
      p_city: 'Milano',
    })
    expect(result.current.me).toMatchObject({ id: ME, publicId: 7, displayName: 'Ana' })
  })

  it('reuses a stored session, skips the upsert when the profile matches, and opens ONE channel', async () => {
    onboardLocalProfile()
    fake.auth.session = { user: { id: ME } }
    fake.rpc.get_my_profile = () => okResult([myProfileRow()])
    const first = renderHook(() => useChatSession())
    const second = renderHook(() => useChatSession())
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    expect(second.result.current.me?.publicId).toBe(7)
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain('upsert_my_profile')
    expect(fake.channels).toHaveLength(1)
    expect(fake.channels[0]?.topic).toBe(`chat:${ME}`)
    expect(fake.channels[0]?.bindings.map((b) => `${b.filter.table}:${b.filter.event}`)).toEqual(['messages:INSERT', 'conversation_members:*', 'conversations:UPDATE'])
    await waitFor(() => expect(fake.rpcCalls.map((c) => c.name)).toContain('list_my_conversations'))
  })

  it('reports anonymous sign-ins disabled as an error with detail, and retries on demand', async () => {
    onboardLocalProfile()
    fake.auth.signInAnonymously.mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled') })
    fake.rpc.get_my_profile = () => okResult([myProfileRow()])
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('not-configured')
    expect(getChatErrorDetail(result.current.error)).toBe('anonymous_disabled')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fake.auth.signInAnonymously).toHaveBeenCalledTimes(2)
  })

  it('is offline without network (no sign-in attempt) and recovers on the online event', async () => {
    onboardLocalProfile()
    fake.rpc.get_my_profile = () => okResult([myProfileRow()])
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled()

    online.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('never replaces a stored session because of a network error', async () => {
    onboardLocalProfile()
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('unavailable')
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('pushes local profile changes with a debounced upsert', async () => {
    await bootReady(fake)
    fake.rpc.upsert_my_profile = (args) => okResult(myProfileRow({ display_name: (args as { p_display_name: string }).p_display_name }))
    vi.useFakeTimers()
    useProfileStore.getState().setName('Ana Maria')
    useProfileStore.getState().setName('Ana Marta')
    await vi.advanceTimersByTimeAsync(PROFILE_SYNC_DEBOUNCE_MS - 100)
    expect(fake.rpcCalls.filter((c) => c.name === 'upsert_my_profile')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(200)
    const upserts = fake.rpcCalls.filter((c) => c.name === 'upsert_my_profile')
    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.args).toMatchObject({ p_display_name: 'Ana Marta', p_role: 'student' })
    expect(useChatStore.getState().session.me?.displayName).toBe('Ana Marta')
  })

  it('signOutChat signs out locally, closes realtime, clears the store and does not re-create a user', async () => {
    await bootReady(fake)
    const channel = fake.lastChannel()
    await signOutChat()
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(channel.removed).toBe(true)
    const s = useChatStore.getState()
    expect(s.session).toMatchObject({ status: 'idle', me: null, userId: null })
    expect(s.list.byId).toEqual({})
    // Still onboarded locally (the UI resets the profile separately): must stay idle.
    useProfileStore.getState().setName('Ana Maria')
    await new Promise((r) => setTimeout(r, 20))
    expect(useChatStore.getState().session.status).toBe('idle')
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled()
  })
})
