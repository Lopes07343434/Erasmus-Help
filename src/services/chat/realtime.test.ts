import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupActions, studentAssociation } from './actions'
import { useChatStore } from './chatStore'
import { getChatErrorDetail } from './errors'
import { signOutChat } from './session'
import { GROUP, OTHER, bootReady, createFakeSupabase, groupRow, myProfileRow, okResult, profileRow, resetChatTestState, type FakeSupabase } from './testUtils'
import { renderHook, waitFor } from '@testing-library/react'
import { useAdminUsers } from '@/hooks/chat'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase
const listCalls = () => fake.rpcCalls.filter((c) => c.name === 'list_my_conversations').length

beforeEach(async () => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  fake.rpc.list_my_conversations = () => okResult([groupRow()])
})

afterEach(() => {
  resetChatTestState()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('realtime channel lifecycle', () => {
  it('resyncs the list on every (re)subscription', async () => {
    await bootReady(fake)
    const before = listCalls()
    fake.lastChannel().setStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(listCalls()).toBe(before + 1))
    fake.lastChannel().setStatus('CHANNEL_ERROR') // realtime-js rejoins by itself
    fake.lastChannel().setStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(listCalls()).toBe(before + 2))
    expect(fake.channels).toHaveLength(1)
  })

  it('refreshes my profile on resync (monitor verified by an admin meanwhile)', async () => {
    await bootReady(fake, { me: { role: 'monitor', monitor_status: 'pending' } })
    expect(useChatStore.getState().session.me?.monitorStatus).toBe('pending')
    fake.rpc.get_my_profile = () => okResult([myProfileRow({ role: 'monitor', monitor_status: 'verified' })])
    fake.lastChannel().setStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(useChatStore.getState().session.me?.monitorStatus).toBe('verified'))
  })

  it('reopens an unexpectedly CLOSED channel with backoff, only while online', async () => {
    await bootReady(fake)
    vi.useFakeTimers()
    fake.lastChannel().setStatus('CLOSED')
    await vi.advanceTimersByTimeAsync(1_500)
    expect(fake.channels).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(fake.channels).toHaveLength(2)

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    fake.lastChannel().setStatus('CLOSED')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.channels).toHaveLength(2) // no reconnect loop while offline
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(fake.channels).toHaveLength(3)
  })

  it('closes the channel on sign-out and ignores late events', async () => {
    await bootReady(fake)
    const ch = fake.lastChannel()
    await signOutChat()
    expect(ch.removed).toBe(true)
    ch.emit('messages', 'INSERT', { id: 'x' })
    ch.emit('conversations', 'UPDATE', { id: GROUP, name: 'Late' })
    expect(useChatStore.getState().list.byId).toEqual({})
  })
})

describe('actions validation', () => {
  it('validates before calling the server', async () => {
    await bootReady(fake)
    await expect(groupActions.createGroup({ name: '   ', memberPublicIds: [] })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groupActions.createGroup({ name: 'Grupo', memberPublicIds: [0] })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groupActions.removeMember(GROUP, 'nope')).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(groupActions.addMember('nope', 3)).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fake.rpcCalls.map((c) => c.name).filter((n) => n !== 'get_my_profile' && n !== 'list_my_conversations')).toEqual([])
  })

  it('creates a group with cleaned name + deduped ids and refreshes the list', async () => {
    await bootReady(fake)
    fake.rpc.create_group = () => okResult(GROUP)
    const before = listCalls()
    await expect(groupActions.createGroup({ name: ' Erasmus   Milano ', memberPublicIds: [3, 3, 4] })).resolves.toBe(GROUP)
    expect(fake.rpcCalls.find((c) => c.name === 'create_group')?.args).toEqual({ p_name: 'Erasmus Milano', p_member_public_ids: [3, 4], p_allow_leave: true })
    expect(listCalls()).toBe(before + 1)
  })

  it('leaving a group removes it locally; server refusals keep their chat code', async () => {
    await bootReady(fake)
    fake.rpc.leave_group = () => ({ data: null, error: { code: 'P0001', message: 'last_manager', details: null, hint: null }, status: 400 })
    const err = await groupActions.leaveGroup(GROUP).catch((e: unknown) => e)
    expect(getChatErrorDetail(err)).toBe('last_manager')
    expect(useChatStore.getState().list.byId[GROUP]).toBeDefined()
    fake.rpc.leave_group = () => okResult(null)
    await groupActions.leaveGroup(GROUP)
    expect(useChatStore.getState().list.byId[GROUP]).toBeUndefined()
  })

  it('lookupStudent only accepts students', async () => {
    await bootReady(fake)
    fake.rpc.lookup_profile_by_public_id = () => okResult([profileRow(OTHER, 2, 'Bruno', 'monitor')])
    await expect(studentAssociation.lookupStudent(2)).rejects.toMatchObject({ code: 'not-found' })
    fake.rpc.lookup_profile_by_public_id = () => okResult([profileRow(OTHER, 2, 'Bruno', 'student')])
    await expect(studentAssociation.lookupStudent(2)).resolves.toMatchObject({ displayName: 'Bruno' })
  })

  it('actions fail with the session state when chat is not ready', async () => {
    await expect(groupActions.lookupByPublicId(3)).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('useAdminUsers', () => {
  it('does not query for non-admins', async () => {
    await bootReady(fake)
    const { result } = renderHook(() => useAdminUsers())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('permission-denied')
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain('admin_list_users')
  })

  it('lists users for admins, maps the monitor, and reloads after a mutation', async () => {
    fake.rpc.admin_list_users = () =>
      okResult([
        { id: OTHER, public_id: 2, display_name: 'Bruno', role: 'student', monitor_status: null, can_manage_groups: false, monitor_id: GROUP, monitor_public_id: 9, monitor_display_name: 'Marta', students_count: 0, created_at: '2026-09-26T10:00:00+00:00' },
      ])
    fake.rpc.admin_verify_monitor = () => okResult(null)
    await bootReady(fake, { me: { role: 'admin' } })
    const { result } = renderHook(() => useAdminUsers())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items[0]).toMatchObject({ id: OTHER, publicId: 2, monitorStatus: null, canManageGroups: false, monitor: { id: GROUP, publicId: 9, displayName: 'Marta', role: 'monitor' } })
    const calls = () => fake.rpcCalls.filter((c) => c.name === 'admin_list_users').length
    const before = calls()
    await result.current.verifyMonitor(OTHER, true)
    await waitFor(() => expect(calls()).toBe(before + 1))
    expect(fake.rpcCalls.find((c) => c.name === 'admin_verify_monitor')?.args).toEqual({ p_user_id: OTHER, p_verified: true })
  })
})
