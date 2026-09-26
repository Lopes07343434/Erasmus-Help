import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordedAudio } from '@/services/audio'
import { useChatStore } from '@/services/chat/chatStore'
import { MESSAGE_COLUMNS } from '@/services/chat/repository'
import {
  DIRECT,
  ME,
  OTHER,
  THIRD,
  bootReady,
  conversationRow,
  createFakeSupabase,
  memberRow,
  okResult,
  resetChatTestState,
  textRow,
  ts,
  uid,
  type FakeResult,
  type FakeSupabase,
  type RecordedQuery,
} from '@/services/chat/testUtils'
import { MARK_READ_THROTTLE_MS } from '@/services/chat/threads'
import { useConversation } from './useConversation'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase
let messageRows: unknown[]
let insertHandler: (q: RecordedQuery) => FakeResult | Promise<FakeResult>

const netError: FakeResult = { data: null, error: { code: '', message: 'TypeError: Failed to fetch', details: '', hint: '' }, status: 0 }

function deferred<T>() {
  let resolve: (v: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Echo of an insert as the server would store it (server created_at). */
function stored(q: RecordedQuery, createdAt: string): FakeResult {
  const v = q.values as Record<string, unknown>
  return okResult({ body: null, audio_path: null, audio_duration_ms: null, audio_mime: null, ...v, created_at: createdAt })
}

beforeEach(async () => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  messageRows = [textRow(uid(1), DIRECT, OTHER, ts(1), 'olá'), textRow(uid(2), DIRECT, ME, ts(2), 'bom dia')]
  insertHandler = (q) => stored(q, ts(10))
  fake.onQuery = (q) => (q.op === 'insert' ? insertHandler(q) : okResult(q.table === 'messages' ? messageRows : []))
  fake.rpc.list_conversation_members = () => okResult([memberRow(ME, 7, 'Ana', ts(2)), memberRow(OTHER, 2, 'Bruno', ts(1), { role: 'monitor' })])
  fake.rpc.mark_conversation_read = () => okResult(ts(20))
  await bootReady(fake, { conversations: [conversationRow({ unread_count: 1, last_message_at: ts(2) })] })
})

afterEach(() => {
  resetChatTestState()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function openConversation() {
  const hook = renderHook(() => useConversation(DIRECT))
  await waitFor(() => expect(hook.result.current.status).toBe('success'))
  return hook
}

describe('useConversation — loading', () => {
  it('loads summary, members and the newest page (explicit columns), and becomes the active conversation', async () => {
    const { result, unmount } = await openConversation()
    expect(result.current.conversation?.otherUser?.displayName).toBe('Bruno')
    expect(result.current.members.map((m) => m.displayName)).toEqual(['Ana', 'Bruno'])
    expect(result.current.messages.map((m) => m.id)).toEqual([uid(1), uid(2)])
    expect(result.current.senders[OTHER]?.displayName).toBe('Bruno')
    expect(result.current.hasOlder).toBe(false)
    const q = fake.queries.find((x) => x.table === 'messages')
    expect(q?.columns).toBe(MESSAGE_COLUMNS)
    expect(q?.ops).toContainEqual(['limit', 51])
    expect(useChatStore.getState().activeConversationId).toBe(DIRECT)
    unmount()
    expect(useChatStore.getState().activeConversationId).toBeNull()
  })

  it('is not-found for a conversation I am not in (and for garbage ids)', async () => {
    const { result } = renderHook(() => useConversation(uid('ffff')))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
    const bad = renderHook(() => useConversation('../etc'))
    await waitFor(() => expect(bad.result.current.status).toBe('not-found'))
  })

  it('paginates older messages with keyset on the oldest loaded message', async () => {
    messageRows = Array.from({ length: 51 }, (_, i) => textRow(uid(200 - i), DIRECT, OTHER, ts(200 - i)))
    const { result } = await openConversation()
    expect(result.current.hasOlder).toBe(true)
    expect(result.current.messages).toHaveLength(50)
    const oldest = result.current.messages[0]
    messageRows = [textRow(uid(100), DIRECT, OTHER, ts(100))]
    await act(() => result.current.loadOlder())
    const last = fake.queries.filter((x) => x.table === 'messages').pop()
    expect(last?.ops).toContainEqual(['or', `created_at.lt."${oldest?.createdAt}",and(created_at.eq."${oldest?.createdAt}",id.lt.${oldest?.id})`])
    expect(result.current.messages[0]?.id).toBe(uid(100))
    expect(result.current.messages).toHaveLength(51)
    expect(result.current.hasOlder).toBe(false)
  })
})

describe('useConversation — sending', () => {
  it('text: optimistic sending → sent (server time) → read when the other member reads it', async () => {
    const gate = deferred<void>()
    insertHandler = async (q) => {
      await gate.promise
      return stored(q, ts(10))
    }
    const { result } = await openConversation()
    let sending: Promise<void> = Promise.resolve()
    act(() => {
      sending = result.current.sendText('  até já  ')
    })
    const optimistic = result.current.messages.at(-1)
    expect(optimistic).toMatchObject({ kind: 'text', body: 'até já', status: 'sending', senderId: ME })
    await act(async () => {}) // the insert is issued (and held by the gate)
    expect(result.current.messages.at(-1)?.status).toBe('sending')
    const insert = fake.queries.find((q) => q.op === 'insert')
    expect(insert?.values).toEqual({ id: optimistic?.id, conversation_id: DIRECT, sender_id: ME, kind: 'text', body: 'até já' })

    await act(async () => {
      gate.resolve()
      await sending
    })
    expect(result.current.messages.at(-1)).toMatchObject({ id: optimistic?.id, status: 'sent', createdAt: ts(10) })
    expect(result.current.conversation?.lastMessage).toMatchObject({ id: optimistic?.id, preview: 'até já' })

    // Realtime echo of my own message: deduped by id.
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(optimistic?.id ?? '', DIRECT, ME, ts(10), 'até já')))
    expect(result.current.messages.filter((m) => m.id === optimistic?.id)).toHaveLength(1)

    act(() => fake.lastChannel().emit('conversation_members', 'UPDATE', { conversation_id: DIRECT, user_id: OTHER, member_role: 'member', last_read_at: ts(11), joined_at: ts(0) }))
    expect(result.current.messages.at(-1)?.status).toBe('read')
    expect(result.current.messages.find((m) => m.id === uid(2))?.status).toBe('read')
    expect(result.current.messages.find((m) => m.id === uid(1))?.status).toBe('sent') // not mine
  })

  it('validation errors throw and create nothing', async () => {
    const { result } = await openConversation()
    await expect(result.current.sendText('   ')).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(result.current.sendText('x'.repeat(4001))).rejects.toMatchObject({ code: 'invalid-input' })
    expect(result.current.messages).toHaveLength(2)
    expect(fake.queries.some((q) => q.op === 'insert')).toBe(false)
  })

  it('refuses to post in an archived conversation', async () => {
    const { result } = await openConversation()
    act(() => fake.lastChannel().emit('conversations', 'UPDATE', { id: DIRECT, kind: 'direct', name: null, allow_leave: true, archived_at: ts(30), last_message_at: ts(2), created_at: ts(0) }))
    expect(result.current.conversation?.archivedAt).toBe(ts(30))
    await expect(result.current.sendText('olá')).rejects.toMatchObject({ code: 'permission-denied', detail: 'archived' })
  })

  it('failure → failed, retry with the SAME id → sent; discard removes a failed message', async () => {
    insertHandler = () => netError
    const { result } = await openConversation()
    await act(() => result.current.sendText('primeira'))
    const failed = result.current.messages.at(-1)
    expect(failed?.status).toBe('failed')

    insertHandler = (q) => stored(q, ts(12))
    await act(() => result.current.retry(failed?.id ?? ''))
    expect(result.current.messages.at(-1)).toMatchObject({ id: failed?.id, status: 'sent', createdAt: ts(12) })
    const inserts = fake.queries.filter((q) => q.op === 'insert').map((q) => (q.values as { id: string }).id)
    expect(inserts).toEqual([failed?.id, failed?.id])

    insertHandler = () => netError
    await act(() => result.current.sendText('segunda'))
    const second = result.current.messages.at(-1)
    expect(second?.status).toBe('failed')
    act(() => result.current.discard(second?.id ?? ''))
    expect(result.current.messages.some((m) => m.id === second?.id)).toBe(false)
  })

  it('marks as failed immediately when offline (no request)', async () => {
    const { result } = await openConversation()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(() => result.current.sendText('offline'))
    expect(result.current.messages.at(-1)?.status).toBe('failed')
    expect(fake.queries.some((q) => q.op === 'insert')).toBe(false)
  })
})

describe('useConversation — audio', () => {
  const audio = (): RecordedAudio => ({ blob: new Blob(['1234'], { type: 'audio/webm;codecs=opus' }), mimeType: 'audio/webm;codecs=opus', durationMs: 1500.4, extension: 'webm' })

  it('uploads first (plain type, conversation path), then inserts the row', async () => {
    const { result } = await openConversation()
    await act(() => result.current.sendAudio(audio()))
    const msg = result.current.messages.at(-1)
    expect(msg).toMatchObject({ kind: 'audio', status: 'sent', audioDurationMs: 1500, audioMime: 'audio/webm' })
    const path = msg?.kind === 'audio' ? msg.audioPath : ''
    expect(path).toBe(`${DIRECT}/${msg?.id}.webm`)
    expect(fake.calls.filter((c) => c.startsWith('upload') || c.startsWith('insert'))).toEqual([`upload:${path}`, 'insert:messages'])
    expect(fake.storage.upload.mock.calls[0]?.[1].type).toBe('audio/webm')
    expect(fake.queries.find((q) => q.op === 'insert')?.values).toEqual({ id: msg?.id, conversation_id: DIRECT, sender_id: ME, kind: 'audio', audio_path: path, audio_duration_ms: 1500, audio_mime: 'audio/webm' })
  })

  it('upload failure → failed (no insert); retry uploads then inserts', async () => {
    fake.storage.upload.mockResolvedValueOnce({ data: null, error: { __isStorageError: true, name: 'StorageUnknownError', message: 'Failed to fetch' } })
    const { result } = await openConversation()
    await act(() => result.current.sendAudio(audio()))
    const failed = result.current.messages.at(-1)
    expect(failed?.status).toBe('failed')
    expect(fake.queries.some((q) => q.op === 'insert')).toBe(false)

    await act(() => result.current.retry(failed?.id ?? ''))
    expect(result.current.messages.at(-1)).toMatchObject({ id: failed?.id, status: 'sent' })
    expect(fake.storage.upload).toHaveBeenCalledTimes(2)
    // same path both times (idempotent), and the row is inserted after the successful upload
    expect(fake.storage.upload.mock.calls[1]?.[0]).toBe(fake.storage.upload.mock.calls[0]?.[0])
    expect(fake.calls.filter((c) => c.startsWith('upload') || c.startsWith('insert'))).toEqual([expect.stringMatching(/^upload:/), 'insert:messages'])
  })

  it('insert failure after upload → retry only re-inserts', async () => {
    insertHandler = () => netError
    const { result } = await openConversation()
    await act(() => result.current.sendAudio(audio()))
    const failed = result.current.messages.at(-1)
    expect(failed?.status).toBe('failed')
    insertHandler = (q) => stored(q, ts(15))
    await act(() => result.current.retry(failed?.id ?? ''))
    expect(result.current.messages.at(-1)?.status).toBe('sent')
    expect(fake.storage.upload).toHaveBeenCalledTimes(1)
    expect(fake.queries.filter((q) => q.op === 'insert')).toHaveLength(2)
  })

  it('rejects unsupported / too long audio before any request', async () => {
    const { result } = await openConversation()
    await expect(result.current.sendAudio({ ...audio(), mimeType: 'audio/wav' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(result.current.sendAudio({ ...audio(), durationMs: 300_001 })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fake.storage.upload).not.toHaveBeenCalled()
  })

  it('signs audio URLs once (cached) and only for paths of this conversation', async () => {
    const { result } = await openConversation()
    const path = `${DIRECT}/${uid(77)}.webm`
    const a = await result.current.getAudioUrl(path)
    const b = await result.current.getAudioUrl(path)
    expect(a).toBe(b)
    expect(fake.storage.createSignedUrl).toHaveBeenCalledTimes(1)
    await expect(result.current.getAudioUrl(`${uid(9)}/${uid(77)}.webm`)).rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('useConversation — realtime and read state', () => {
  it('appends realtime messages in order, deduped, without bumping unread for the open conversation', async () => {
    const { result } = await openConversation()
    const ch = fake.lastChannel()
    act(() => {
      ch.emit('messages', 'INSERT', textRow(uid(5), DIRECT, OTHER, ts(5)))
      ch.emit('messages', 'INSERT', textRow(uid(4), DIRECT, OTHER, ts(4)))
      ch.emit('messages', 'INSERT', textRow(uid(5), DIRECT, OTHER, ts(5)))
      ch.emit('messages', 'INSERT', textRow(uid(9), uid('9999'), THIRD, ts(6))) // not mine: ignored here
    })
    expect(result.current.messages.map((m) => m.id)).toEqual([uid(1), uid(2), uid(4), uid(5)])
    expect(result.current.conversation?.unreadCount).toBe(1) // unchanged (active)
    expect(result.current.conversation?.lastMessage?.id).toBe(uid(5))
  })

  it('markRead is throttled (~2 s) and skipped when nothing is unread', async () => {
    const { result } = await openConversation()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    act(() => {
      result.current.markRead()
      result.current.markRead()
      result.current.markRead()
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(fake.rpcCalls.filter((c) => c.name === 'mark_conversation_read')).toHaveLength(1)
    expect(result.current.conversation?.unreadCount).toBe(0)
    expect(result.current.members.find((m) => m.id === ME)?.lastReadAt).toBe(ts(20))

    // trailing call: nothing new → no request
    await act(() => vi.advanceTimersByTimeAsync(MARK_READ_THROTTLE_MS))
    expect(fake.rpcCalls.filter((c) => c.name === 'mark_conversation_read')).toHaveLength(1)

    // new incoming message while open → next markRead goes through
    act(() => fake.lastChannel().emit('messages', 'INSERT', textRow(uid(30), DIRECT, OTHER, ts(30))))
    fake.rpc.mark_conversation_read = () => okResult(ts(31))
    act(() => result.current.markRead())
    await act(() => vi.advanceTimersByTimeAsync(MARK_READ_THROTTLE_MS))
    expect(fake.rpcCalls.filter((c) => c.name === 'mark_conversation_read')).toHaveLength(2)
  })
})
