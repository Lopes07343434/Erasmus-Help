import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { directChatActions, groupActions, peopleActions, profileActions } from './actions'
import { avatarUrl } from './avatars'
import { useChatStore } from './chatStore'
import { getChatErrorDetail } from './errors'
import { avatarPathOf, parseConversationRow, parseConversationUpdate, parsePersonSearchRow, searchableQuery } from './mappers'
import * as repo from './repository'
import {
  GROUP,
  ME,
  OTHER,
  THIRD,
  bootReady,
  conversationRow,
  createFakeSupabase,
  groupRow,
  memberRow,
  okResult,
  profileRow,
  resetChatTestState,
  ts,
  uid,
  type FakeSupabase,
} from './testUtils'

const h = vi.hoisted(() => ({ client: null as unknown, prepare: vi.fn((file: Blob) => Promise.resolve(new Blob([file], { type: 'image/jpeg' }))) }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))
vi.mock('./avatarImage', () => ({ prepareAvatarImage: h.prepare }))

const USER_PHOTO = (owner: string, n = 1) => `users/${owner}/${uid(`f${n}`)}.jpg`
const GROUP_PHOTO = (n = 1) => `groups/${GROUP}/${uid(`f${n}`)}.jpg`
const NEW_PATH = /^users\/00000000-0000-4000-8000-00000000a001\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/

let fake: FakeSupabase
beforeEach(() => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  h.prepare.mockClear()
})
afterEach(() => resetChatTestState())

describe('mappers', () => {
  it('accepts only photo paths of the right owner and shape', () => {
    expect(avatarPathOf('users', ME, USER_PHOTO(ME))).toBe(USER_PHOTO(ME))
    expect(avatarPathOf('users', ME, USER_PHOTO(OTHER))).toBeNull() // someone else's folder
    expect(avatarPathOf('groups', ME, USER_PHOTO(ME))).toBeNull() // wrong scope
    expect(avatarPathOf('users', ME, `users/${ME}/../${OTHER}/x.jpg`)).toBeNull()
    expect(avatarPathOf('users', ME, `users/${ME}/${uid(1)}.gif`)).toBeNull()
    expect(avatarPathOf('users', ME, null)).toBeNull()
  })

  it('parses search rows (photo kept, malformed photo dropped, person kept)', () => {
    expect(parsePersonSearchRow({ ...profileRow(OTHER, 15, 'Samuel Lopes', 'monitor'), avatar_path: USER_PHOTO(OTHER), exact_id_match: true })).toEqual({
      id: OTHER,
      publicId: 15,
      displayName: 'Samuel Lopes',
      role: 'monitor',
      avatarPath: USER_PHOTO(OTHER),
      exactIdMatch: true,
    })
    expect(parsePersonSearchRow({ ...profileRow(OTHER, 15, 'Samuel'), avatar_path: 'https://evil.test/x.jpg' })).toMatchObject({ avatarPath: null, exactIdMatch: false })
    expect(parsePersonSearchRow({ id: OTHER, display_name: 'No id' })).toBeNull()
  })

  it('reads group photos and other people photos from the conversation list', () => {
    expect(parseConversationRow(groupRow({ avatar_path: GROUP_PHOTO() }))?.avatarPath).toBe(GROUP_PHOTO())
    const direct = parseConversationRow(conversationRow({ other_user: { ...profileRow(OTHER, 2, 'Bruno'), avatar_path: USER_PHOTO(OTHER) } }))
    expect(direct).toMatchObject({ avatarPath: null, otherUser: { avatarPath: USER_PHOTO(OTHER) } })
  })

  it('distinguishes a removed group photo from a payload without the column', () => {
    expect(parseConversationUpdate({ id: GROUP, avatar_path: null })?.avatarPath).toBeNull()
    expect(parseConversationUpdate({ id: GROUP, avatar_path: GROUP_PHOTO(2) })?.avatarPath).toBe(GROUP_PHOTO(2))
    expect(parseConversationUpdate({ id: GROUP })?.avatarPath).toBeUndefined()
  })

  it('knows when there is something to search', () => {
    expect(searchableQuery('')).toBeNull()
    expect(searchableQuery('   ')).toBeNull()
    expect(searchableQuery('a')).toBeNull() // names need 2 characters
    expect(searchableQuery('0')).toBeNull() // no ID 0
    expect(searchableQuery('00')).toBeNull()
    expect(searchableQuery('7')).toBe('7') // a single digit is an ID
    expect(searchableQuery(' ID: 07 ')).toBe('ID: 07')
    expect(searchableQuery('  Ana   Costa ')).toBe('Ana Costa')
    expect(searchableQuery('x'.repeat(80))).toHaveLength(60)
  })
})

describe('repository', () => {
  it('search_profiles / start_direct_conversation / set_group_member_role send the right arguments', async () => {
    fake.rpc.search_profiles = () => okResult([{ ...profileRow(OTHER, 15, 'Samuel'), exact_id_match: true }, { ...profileRow(THIRD, 150, 'Carla'), exact_id_match: false }])
    await expect(repo.searchProfiles('15')).resolves.toHaveLength(2)
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'search_profiles', args: { p_query: '15', p_limit: 20 } })

    fake.rpc.start_direct_conversation = () => okResult(uid('d9'))
    await expect(repo.startDirectConversation(15)).resolves.toBe(uid('d9'))
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'start_direct_conversation', args: { p_public_id: 15 } })

    await repo.setGroupMemberRole(GROUP, OTHER, 'manager')
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'set_group_member_role', args: { p_conversation: GROUP, p_user_id: OTHER, p_role: 'manager' } })
  })

  it('maps directory errors (self, not found, not allowed)', async () => {
    fake.rpc.start_direct_conversation = () => ({ data: null, error: { code: 'P0001', message: 'not_found', details: null, hint: null }, status: 400 })
    const err = await repo.startDirectConversation(99).catch((e: unknown) => e)
    expect(getChatErrorDetail(err)).toBe('not_found')
    fake.rpc.set_group_member_role = () => ({ data: null, error: { code: 'P0001', message: 'last_manager', details: null, hint: null }, status: 400 })
    expect(getChatErrorDetail(await repo.setGroupMemberRole(GROUP, ME, 'member').catch((e: unknown) => e))).toBe('last_manager')
  })

  it('photo RPCs send the path, or no path to remove it', async () => {
    fake.rpc.set_my_avatar = (args) => okResult((args as { p_path?: string }).p_path ?? null)
    await expect(repo.setMyAvatar(USER_PHOTO(ME))).resolves.toBe(USER_PHOTO(ME))
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'set_my_avatar', args: { p_path: USER_PHOTO(ME) } })
    await expect(repo.setMyAvatar(null)).resolves.toBeNull()
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'set_my_avatar', args: {} })
    fake.rpc.set_group_avatar = () => okResult(null)
    await repo.setGroupAvatar(GROUP, null)
    expect(fake.rpcCalls.at(-1)).toEqual({ name: 'set_group_avatar', args: { p_conversation: GROUP } })
  })

  it('avatarUrl builds the public URL once per path', () => {
    const path = USER_PHOTO(OTHER, 7)
    expect(avatarUrl(path)).toBe(`https://example.test/public/${path}`)
    expect(avatarUrl(path)).toBe(`https://example.test/public/${path}`)
    expect(fake.storage.getPublicUrl).toHaveBeenCalledTimes(1)
    expect(fake.storage.buckets).toContain('avatars')
    expect(avatarUrl(null)).toBeNull()
  })
})

describe('actions', () => {
  it('people search validates, remembers the profiles and skips empty queries', async () => {
    await bootReady(fake)
    fake.rpc.search_profiles = () => okResult([{ ...profileRow(OTHER, 15, 'Samuel'), exact_id_match: true }])
    await expect(peopleActions.search('a')).resolves.toEqual([])
    expect(fake.rpcCalls.some((c) => c.name === 'search_profiles')).toBe(false)
    const results = await peopleActions.search(' 015 ')
    expect(results.map((p) => p.publicId)).toEqual([15])
    expect(fake.rpcCalls.at(-1)?.args).toEqual({ p_query: '015', p_limit: 20 })
    expect(useChatStore.getState().profiles[OTHER]?.displayName).toBe('Samuel')
  })

  it('starting a direct chat refreshes the list and refuses my own ID', async () => {
    await bootReady(fake, { me: { public_id: 7 } })
    const conv = uid('d9')
    fake.rpc.start_direct_conversation = () => okResult(conv)
    fake.rpc.list_my_conversations = () => okResult([conversationRow({ id: conv })])
    await expect(directChatActions.startDirectConversation(15)).resolves.toBe(conv)
    expect(useChatStore.getState().list.byId[conv]).toBeDefined()
    const err = await directChatActions.startDirectConversation(7).catch((e: unknown) => e)
    expect(getChatErrorDetail(err)).toBe('invalid_input')
  })

  it('new profile photo: prepared, uploaded at a fresh path, saved, old one removed', async () => {
    await bootReady(fake, { me: { avatar_path: USER_PHOTO(ME, 1) } })
    fake.rpc.set_my_avatar = (args) => okResult((args as { p_path?: string }).p_path ?? null)
    const file = new File(['x'], 'me.png', { type: 'image/png' })
    await profileActions.setMyAvatar(file)
    expect(h.prepare).toHaveBeenCalledWith(file)
    const [path, body, opts] = fake.storage.upload.mock.calls.at(-1) ?? []
    expect(path).toMatch(NEW_PATH)
    expect(body?.type).toBe('image/jpeg')
    expect(opts).toMatchObject({ contentType: 'image/jpeg', upsert: false })
    expect(useChatStore.getState().session.me?.avatarPath).toBe(path)
    expect(fake.storage.remove).toHaveBeenCalledWith([USER_PHOTO(ME, 1)])
  })

  it('a photo that fails to save is deleted again; removing the photo uploads nothing', async () => {
    await bootReady(fake, { me: { avatar_path: USER_PHOTO(ME, 1) } })
    fake.rpc.set_my_avatar = () => ({ data: null, error: { code: 'P0001', message: 'not_found', details: null, hint: null }, status: 400 })
    await expect(profileActions.setMyAvatar(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'not-found' })
    const uploaded = fake.storage.upload.mock.calls.at(-1)?.[0]
    expect(fake.storage.remove).toHaveBeenCalledWith([uploaded])
    expect(useChatStore.getState().session.me?.avatarPath).toBe(USER_PHOTO(ME, 1))

    fake.storage.upload.mockClear()
    fake.storage.remove.mockClear()
    fake.rpc.set_my_avatar = () => okResult(null)
    await profileActions.setMyAvatar(null)
    expect(fake.storage.upload).not.toHaveBeenCalled()
    expect(useChatStore.getState().session.me?.avatarPath).toBeNull()
    expect(fake.storage.remove).toHaveBeenCalledWith([USER_PHOTO(ME, 1)])
  })

  it('group photo and member roles update the store at once', async () => {
    await bootReady(fake, { conversations: [groupRow({ my_role: 'manager' })] })
    fake.rpc.list_conversation_members = () => okResult([memberRow(ME, 1, 'Ana', ts(1), { member_role: 'manager' }), memberRow(OTHER, 2, 'Bruno', ts(1))])
    const { refreshMembers } = await import('./threads')
    await refreshMembers(GROUP)

    await groupActions.setMemberRole(GROUP, OTHER, 'manager')
    expect(useChatStore.getState().members[GROUP]?.items.find((m) => m.id === OTHER)?.memberRole).toBe('manager')
    await groupActions.setMemberRole(GROUP, ME, 'member')
    expect(useChatStore.getState().list.byId[GROUP]?.myRole).toBe('member')

    fake.rpc.set_group_avatar = (args) => okResult((args as { p_path?: string }).p_path ?? null)
    await groupActions.setGroupAvatar(GROUP, new File(['x'], 'g.jpg', { type: 'image/jpeg' }))
    const path = fake.storage.upload.mock.calls.at(-1)?.[0]
    expect(path).toMatch(new RegExp(`^groups/${GROUP}/[0-9a-f-]{36}\\.jpg$`))
    expect(useChatStore.getState().list.byId[GROUP]?.avatarPath).toBe(path)
  })
})
