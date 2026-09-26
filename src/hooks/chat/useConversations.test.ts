import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveConversation, useChatStore } from '@/services/chat/chatStore'
import {
  DIRECT,
  GROUP,
  ME,
  OTHER,
  THIRD,
  bootReady,
  conversationRow,
  createFakeSupabase,
  groupRow,
  okResult,
  resetChatTestState,
  textRow,
  ts,
  uid,
  type FakeSupabase,
} from '@/services/chat/testUtils'
import { useConversations } from './useConversations'
import { useUnreadCounts } from './useUnreadCounts'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

const lastFrom = (id: string, sender: string, at: string) => ({ id, kind: 'text', preview: 'x', audio_duration_ms: null, sender_id: sender, sender_name: 'Bruno', created_at: at })
const DIRECT2 = uid('d002')

let fake: FakeSupabase
let rows: unknown[]

beforeEach(async () => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  rows = [
    conversationRow({ last_message_at: ts(2), last_message: lastFrom(uid(2), OTHER, ts(2)) }),
    conversationRow({ id: DIRECT2, other_user: { id: THIRD, public_id: 3, display_name: 'Carla', role: 'student' }, created_at: ts(1) }),
    groupRow({ unread_count: 3, last_message_at: ts(1), last_message: lastFrom(uid(1), THIRD, ts(1)) }),
  ]
  fake.rpc.list_my_conversations = () => okResult(rows)
  await bootReady(fake)
})

afterEach(() => {
  resetChatTestState()
  vi.restoreAllMocks()
})

function mount() {
  const direct = renderHook(() => useConversations('direct'))
  const groups = renderHook(() => useConversations('group'))
  const unread = renderHook(() => useUnreadCounts())
  return { direct, groups, unread }
}

describe('useConversations', () => {
  it('filters by kind and sorts by last activity (fallback createdAt)', async () => {
    const { direct, groups, unread } = mount()
    await waitFor(() => expect(direct.result.current.status).toBe('success'))
    expect(direct.result.current.items.map((c) => c.id)).toEqual([DIRECT, DIRECT2])
    expect(groups.result.current.items.map((c) => c.id)).toEqual([GROUP])
    expect(unread.result.current).toEqual({ total: 3, direct: 0, groups: 3 })
  })

  it('a new incoming message bumps order, preview and unread', async () => {
    const { direct, unread } = mount()
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(50), DIRECT2, THIRD, ts(50), 'nova\nlinha')))
    expect(direct.result.current.items.map((c) => c.id)).toEqual([DIRECT2, DIRECT])
    expect(direct.result.current.items[0]).toMatchObject({ unreadCount: 1, lastMessageAt: ts(50), lastMessage: { id: uid(50), preview: 'nova linha', senderId: THIRD } })
    expect(unread.result.current).toEqual({ total: 4, direct: 1, groups: 3 })
  })

  it('never counts my own messages, the active conversation, old or duplicate events', async () => {
    const { direct, groups, unread } = mount()
    const ch = fake.lastChannel()
    act(() => {
      ch.emit('messages', 'INSERT', textRow(uid(60), GROUP, ME, ts(60))) // mine
      ch.emit('messages', 'INSERT', textRow(uid(1), DIRECT, OTHER, ts(1))) // older than the known last message
      ch.emit('messages', 'INSERT', textRow(uid(61), DIRECT, OTHER, ts(61)))
      ch.emit('messages', 'INSERT', textRow(uid(61), DIRECT, OTHER, ts(61))) // duplicate
    })
    expect(groups.result.current.items[0]).toMatchObject({ unreadCount: 3, lastMessage: { id: uid(60) } })
    expect(direct.result.current.items.find((c) => c.id === DIRECT)?.unreadCount).toBe(1)

    act(() => setActiveConversation(DIRECT))
    act(() => ch.emit('messages', 'INSERT', textRow(uid(62), DIRECT, OTHER, ts(62))))
    expect(direct.result.current.items.find((c) => c.id === DIRECT)).toMatchObject({ unreadCount: 1, lastMessage: { id: uid(62) } })
    expect(unread.result.current.total).toBe(4)
  })

  it('caps unread at 100 and ignores archived conversations in the badge totals', async () => {
    rows = [conversationRow({ unread_count: 100, last_message_at: ts(2) }), groupRow({ unread_count: 5, archived_at: ts(3) })]
    const { direct, groups, unread } = mount()
    act(() => direct.result.current.refresh())
    await waitFor(() => expect(groups.result.current.items[0]?.archivedAt).toBe(ts(3)))
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(70), DIRECT, OTHER, ts(70))))
    expect(direct.result.current.items[0]?.unreadCount).toBe(100)
    expect(unread.result.current).toEqual({ total: 100, direct: 100, groups: 0 })
  })

  it('applies membership changes: removed from a group, added to a new conversation', async () => {
    const { direct, groups } = mount()
    const ch = fake.lastChannel()
    act(() => ch.emit('conversation_members', 'DELETE', {}, { conversation_id: GROUP, user_id: ME }))
    expect(groups.result.current.items).toEqual([])

    // DELETE events are not RLS-filtered: unknown conversations are ignored
    act(() => ch.emit('conversation_members', 'DELETE', {}, { conversation_id: uid('7777'), user_id: ME }))

    const NEW = uid('d003')
    rows = [...rows, conversationRow({ id: NEW, created_at: ts(90), other_user: { id: THIRD, public_id: 3, display_name: 'Carla', role: 'monitor' } })]
    const before = fake.rpcCalls.filter((c) => c.name === 'list_my_conversations').length
    act(() => ch.emit('conversation_members', 'INSERT', { conversation_id: NEW, user_id: ME, member_role: 'member', joined_at: ts(90), last_read_at: ts(90) }))
    await waitFor(() => expect(direct.result.current.items.map((c) => c.id)).toContain(NEW))
    expect(fake.rpcCalls.filter((c) => c.name === 'list_my_conversations').length).toBe(before + 1)
  })

  it('applies conversation updates (rename, archive) and my read state from another device', async () => {
    const { groups, unread } = mount()
    const ch = fake.lastChannel()
    act(() => ch.emit('conversations', 'UPDATE', { id: GROUP, kind: 'group', name: 'Erasmus 2026', allow_leave: false, archived_at: null, last_message_at: ts(1), created_at: ts(0) }))
    expect(groups.result.current.items[0]).toMatchObject({ name: 'Erasmus 2026', allowLeave: false })

    act(() => ch.emit('conversation_members', 'UPDATE', { conversation_id: GROUP, user_id: ME, member_role: 'member', joined_at: ts(0), last_read_at: ts(5) }))
    expect(groups.result.current.items[0]?.unreadCount).toBe(0)
    expect(unread.result.current.groups).toBe(0)
  })

  it('does not refresh for messages of conversations an admin is not in', async () => {
    resetChatTestState()
    fake = createFakeSupabase()
    h.client = fake.client
    fake.rpc.list_my_conversations = () => okResult([])
    await bootReady(fake, { me: { role: 'admin' } })
    const calls = () => fake.rpcCalls.filter((c) => c.name === 'list_my_conversations').length
    const before = calls()
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(80), uid('abcd'), OTHER, ts(80))))
    await new Promise((r) => setTimeout(r, 400))
    expect(calls()).toBe(before)
    expect(useChatStore.getState().list.byId).toEqual({})
  })
})
