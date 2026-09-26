import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { setActiveConversation } from '@/services/chat/chatStore'
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
  profileRow,
  resetChatTestState,
  textRow,
  ts,
  uid,
  type FakeSupabase,
} from '@/services/chat/testUtils'
import { useChatNotifications } from './useChatNotifications'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase

beforeEach(async () => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  fake.onQuery = (q) => okResult(q.table === 'profiles' ? [profileRow(THIRD, 3, 'Carla')] : [])
  await bootReady(fake, { conversations: [conversationRow(), groupRow()] })
})

afterEach(() => {
  resetChatTestState()
  vi.restoreAllMocks()
})

function mount(active: string | null = null) {
  const onNotice = vi.fn<(n: IncomingMessageNotice) => void>()
  const hook = renderHook(({ a }) => useChatNotifications(onNotice, a), { initialProps: { a: active } })
  return { onNotice, hook }
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 10)))

describe('useChatNotifications', () => {
  it('direct: title and sender are the other person; text preview is one line', async () => {
    const { onNotice } = mount()
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(1), DIRECT, OTHER, ts(5), 'olá\nAna')))
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1))
    expect(onNotice).toHaveBeenCalledWith({ conversationId: DIRECT, kind: 'direct', title: 'Bruno', senderName: 'Bruno', preview: 'olá Ana', audioDurationMs: null })
  })

  it('group: title is the group name; an unknown sender profile is fetched (explicit columns)', async () => {
    const { onNotice } = mount()
    const audio = { ...textRow(uid(2), GROUP, THIRD, ts(6)), kind: 'audio', body: null, audio_path: `${GROUP}/${uid(9)}.webm`, audio_duration_ms: 4200, audio_mime: 'audio/webm' }
    act(() => fake.lastChannel().emit('messages', 'INSERT', audio))
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1))
    expect(onNotice).toHaveBeenCalledWith({ conversationId: GROUP, kind: 'group', title: 'Erasmus Milano', senderName: 'Carla', preview: null, audioDurationMs: 4200 })
    const q = fake.queries.find((x) => x.table === 'profiles')
    expect(q?.columns).toBe('id,public_id,display_name,role,avatar_path')
    expect(q?.ops).toContainEqual(['in', 'id', [THIRD]])
  })

  it('never fires for my own messages or the conversation that is open', async () => {
    const { onNotice, hook } = mount(DIRECT)
    const ch = fake.lastChannel()
    act(() => {
      ch.emit('messages', 'INSERT', textRow(uid(3), GROUP, ME, ts(7)))
      ch.emit('messages', 'INSERT', textRow(uid(4), DIRECT, OTHER, ts(8)))
    })
    await flush()
    expect(onNotice).not.toHaveBeenCalled()

    hook.rerender({ a: null })
    act(() => setActiveConversation(GROUP)) // a mounted conversation screen also counts as open
    act(() => ch.emit('messages', 'INSERT', textRow(uid(5), GROUP, OTHER, ts(9))))
    await flush()
    expect(onNotice).not.toHaveBeenCalled()

    act(() => ch.emit('messages', 'INSERT', textRow(uid(6), DIRECT, OTHER, ts(10))))
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1))
  })

  it('stops after unmount', async () => {
    const { onNotice, hook } = mount()
    hook.unmount()
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(7), DIRECT, OTHER, ts(11))))
    await flush()
    expect(onNotice).not.toHaveBeenCalled()
  })
})
