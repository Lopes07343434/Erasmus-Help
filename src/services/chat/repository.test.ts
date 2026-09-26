import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getChatErrorDetail } from './errors'
import * as repo from './repository'
import { DIRECT, ME, OTHER, conversationRow, createFakeSupabase, myProfileRow, profileRow, textRow, ts, uid, type FakeSupabase } from './testUtils'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase
beforeEach(() => {
  fake = createFakeSupabase()
  h.client = fake.client
})

const ok = (data: unknown) => ({ data, error: null, status: 200 })

describe('explicit column lists', () => {
  it('never selects * and names every column it reads', async () => {
    fake.onQuery = (q) => ok(q.table === 'profiles' ? [profileRow(OTHER, 2, 'Bruno')] : [])
    await repo.fetchProfiles([OTHER, OTHER, 'not-a-uuid'])
    await repo.fetchMessagesPage(DIRECT)
    for (const q of fake.queries) expect(q.columns).not.toContain('*')
    const [profiles, messages] = fake.queries
    expect(profiles).toMatchObject({ table: 'profiles', columns: 'id,public_id,display_name,role,avatar_path' })
    expect(profiles?.ops).toContainEqual(['in', 'id', [OTHER]]) // deduped, invalid ids dropped
    expect(messages?.columns).toBe('id,conversation_id,sender_id,kind,body,audio_path,audio_duration_ms,audio_mime,created_at')
  })

  it('skips the profiles query when there is nothing valid to fetch', async () => {
    expect(await repo.fetchProfiles(['x'])).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })
})

describe('messages', () => {
  it('pages newest-first with keyset on (created_at, id) and returns chronological order', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => textRow(uid(100 - i), DIRECT, OTHER, ts(100 - i)))
    fake.onQuery = () => ok(rows)
    const page = await repo.fetchMessagesPage(DIRECT, { createdAt: ts(101, 5), id: uid(999) })
    const q = fake.queries[0]
    expect(q?.ops).toEqual([
      ['eq', 'conversation_id', DIRECT],
      ['or', `created_at.lt."${ts(101, 5)}",and(created_at.eq."${ts(101, 5)}",id.lt.${uid(999)})`],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['limit', 51],
    ])
    expect(page.hasMore).toBe(true)
    expect(page.messages).toHaveLength(50)
    expect(page.messages[0]?.createdAt).toBe(ts(51))
    expect(page.messages[49]?.createdAt).toBe(ts(100))
  })

  it('inserts with a client id and without created_at; a duplicate id returns the stored row', async () => {
    const id = uid(42)
    fake.onQuery = (q) => (q.op === 'insert' ? ok(textRow(id, DIRECT, ME, ts(5), 'olá')) : ok(null))
    const msg = await repo.insertMessage({ id, conversationId: DIRECT, senderId: ME, kind: 'text', body: 'olá' })
    expect(fake.queries[0]?.values).toEqual({ id, conversation_id: DIRECT, sender_id: ME, kind: 'text', body: 'olá' })
    expect(fake.queries[0]?.columns).toBe(repo.MESSAGE_COLUMNS)
    expect(msg).toMatchObject({ id, status: 'sent', createdAt: ts(5) })

    fake.queries.length = 0
    fake.onQuery = (q) =>
      q.op === 'insert'
        ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "messages_pkey"', details: '', hint: '' }, status: 409 }
        : ok(textRow(id, DIRECT, ME, ts(5), 'olá'))
    await expect(repo.insertMessage({ id, conversationId: DIRECT, senderId: ME, kind: 'text', body: 'olá' })).resolves.toMatchObject({ id, createdAt: ts(5) })
    expect(fake.queries[1]).toMatchObject({ op: 'select', columns: repo.MESSAGE_COLUMNS, ops: [['eq', 'id', id], ['maybeSingle']] })
  })

  it('maps RLS rejections of an insert', async () => {
    fake.onQuery = () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy', details: '', hint: '' }, status: 403 })
    await expect(repo.insertMessage({ id: uid(1), conversationId: DIRECT, senderId: ME, kind: 'text', body: 'x' })).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('audio storage', () => {
  it('uploads with the plain content type (re-wrapping codec-typed blobs) and no upsert', async () => {
    const blob = new Blob(['abc'], { type: 'audio/webm;codecs=opus' })
    await repo.uploadAudio(`${DIRECT}/${uid(1)}.webm`, blob, 'audio/webm')
    const [path, body, opts] = fake.storage.upload.mock.calls[0] ?? []
    expect(fake.storage.buckets).toEqual(['chat-audio'])
    expect(path).toBe(`${DIRECT}/${uid(1)}.webm`)
    expect(body?.type).toBe('audio/webm')
    expect(body?.size).toBe(3)
    expect(opts).toMatchObject({ contentType: 'audio/webm', upsert: false })
  })

  it('treats "already exists" (previous attempt) as uploaded, maps other errors', async () => {
    fake.storage.upload.mockResolvedValueOnce({ data: null, error: { __isStorageError: true, name: 'StorageApiError', status: 409, statusCode: '409', message: 'The resource already exists' } })
    await expect(repo.uploadAudio(`${DIRECT}/${uid(1)}.webm`, new Blob(['a'], { type: 'audio/webm' }), 'audio/webm')).resolves.toBeUndefined()
    fake.storage.upload.mockResolvedValueOnce({ data: null, error: { __isStorageError: true, name: 'StorageApiError', status: 413, statusCode: '413', code: 'EntityTooLarge', message: 'too big' } })
    await expect(repo.uploadAudio(`${DIRECT}/${uid(1)}.webm`, new Blob(['a'], { type: 'audio/webm' }), 'audio/webm')).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('signs URLs for 5 minutes', async () => {
    await expect(repo.createAudioSignedUrl(`${DIRECT}/${uid(1)}.webm`)).resolves.toContain('signed')
    expect(fake.storage.createSignedUrl).toHaveBeenCalledWith(`${DIRECT}/${uid(1)}.webm`, 300)
  })
})

describe('RPCs', () => {
  it('upsert_my_profile sends only the known fields', async () => {
    fake.rpc.upsert_my_profile = () => ok(myProfileRow())
    const me = await repo.upsertMyProfile({ displayName: 'Ana', role: 'student', myLanguage: 'pt-PT', appLanguage: null, countryCode: 'IT', city: null })
    expect(fake.rpcCalls[0]).toEqual({ name: 'upsert_my_profile', args: { p_display_name: 'Ana', p_role: 'student', p_my_language: 'pt-PT', p_country_code: 'IT' } })
    expect(me.publicId).toBe(7)
  })

  it('lists conversations with archived ones and skips invalid rows', async () => {
    fake.rpc.list_my_conversations = () => ok([conversationRow(), { id: 'broken' }])
    const items = await repo.listMyConversations()
    expect(fake.rpcCalls[0]).toEqual({ name: 'list_my_conversations', args: { p_include_archived: true } })
    expect(items.map((c) => c.id)).toEqual([DIRECT])
  })

  it('surfaces the chat code of a P0001 error', async () => {
    fake.rpc.associate_student = () => ({ data: null, error: { code: 'P0001', message: 'already_associated', details: null, hint: null }, status: 400 })
    const err = await repo.associateStudent(12).catch((e: unknown) => e)
    expect(getChatErrorDetail(err)).toBe('already_associated')
  })

  it('lookup returns the public profile or not-found', async () => {
    fake.rpc.lookup_profile_by_public_id = () => ok([profileRow(OTHER, 12, 'Bruno')])
    await expect(repo.lookupProfileByPublicId(12)).resolves.toEqual({ id: OTHER, publicId: 12, displayName: 'Bruno', role: 'student', avatarPath: null })
    fake.rpc.lookup_profile_by_public_id = () => ok([])
    await expect(repo.lookupProfileByPublicId(12)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('reports not-configured without a client', async () => {
    h.client = null
    await expect(repo.listMyConversations()).rejects.toMatchObject({ code: 'not-configured' })
  })
})
