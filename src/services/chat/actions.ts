/**
 * Chat actions (people search, direct chats, photos, groups, admin) (validated inputs → RPC → local store update).
 * Every function throws AppError / ChatError (see errors.ts); the server re-validates everything.
 */
import type { AdminUsersState, DirectChatActions, GroupActions, PeopleActions, ProfileActions } from './api'
import { prepareAvatarImage } from './avatarImage'
import { newAvatarPath } from './avatars'
import {
  applyMembershipUpdate,
  patchConversation,
  rememberProfiles,
  removeConversation,
  removeMember as removeMemberFromStore,
  setSession,
  useChatStore,
} from './chatStore'
import { ChatError } from './errors'
import { searchableQuery, validateGroupName, validatePublicId, validateUuid } from './mappers'
import * as repo from './repository'
import { requireReadyUser } from './runtime'
import { refreshConversations, refreshMembers, scheduleConversationsRefresh } from './threads'
import { CHAT_LIMITS, type MemberRole, type PersonSearchResult } from './types'

const get = useChatStore.getState

export const peopleActions: PeopleActions = {
  async search(query): Promise<PersonSearchResult[]> {
    requireReadyUser()
    const q = searchableQuery(query)
    if (!q) return []
    const results = await repo.searchProfiles(q)
    rememberProfiles(results)
    return results
  },
}

export const directChatActions: DirectChatActions = {
  async startDirectConversation(publicId) {
    requireReadyUser()
    const id = validatePublicId(publicId)
    if (id === get().session.me?.publicId) throw new ChatError('invalid-input', 'invalid_input')
    const conversationId = await repo.startDirectConversation(id)
    await refreshConversations()
    return conversationId
  },
}

/** Uploads a prepared photo at a new path; removes the uploaded object again if `commit` fails. */
async function replacePhoto(scope: 'users' | 'groups', ownerId: string, image: Blob | null, commit: (path: string | null) => Promise<string | null>): Promise<string | null> {
  if (!image) return commit(null)
  const jpeg = await prepareAvatarImage(image)
  const path = newAvatarPath(scope, ownerId)
  await repo.uploadAvatar(path, jpeg)
  try {
    return await commit(path)
  } catch (err) {
    void repo.removeAvatarObject(path)
    throw err
  }
}

export const profileActions: ProfileActions = {
  async setMyAvatar(image) {
    const userId = requireReadyUser()
    const before = get().session.me?.avatarPath ?? null
    const stored = await replacePhoto('users', userId, image, (path) => repo.setMyAvatar(path))
    const me = get().session.me
    if (me && me.id === userId) setSession({ me: { ...me, avatarPath: stored } })
    if (before && before !== stored) void repo.removeAvatarObject(before)
  },
}

export const groupActions: GroupActions = {
  async createGroup({ name, memberPublicIds, allowLeave = true }) {
    requireReadyUser()
    const cleanName = validateGroupName(name)
    const ids = [...new Set(memberPublicIds.map(validatePublicId))]
    if (ids.length > CHAT_LIMITS.groupCreateMaxMembers) throw new ChatError('invalid-input', 'invalid_input')
    const id = await repo.createGroup(cleanName, ids, allowLeave)
    await refreshConversations()
    return id
  },

  async renameGroup(conversationId, name) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    const cleanName = validateGroupName(name)
    await repo.renameGroup(id, cleanName)
    patchConversation(id, { name: cleanName })
  },

  async setArchived(conversationId, archived) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    await repo.setGroupArchived(id, archived)
    const cur = get().list.byId[id]
    // The exact server timestamp arrives with the Realtime UPDATE.
    patchConversation(id, { archivedAt: archived ? (cur?.archivedAt ?? new Date().toISOString()) : null })
  },

  async deleteGroup(conversationId) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    await repo.deleteGroup(id)
    removeConversation(id)
  },

  async addMember(conversationId, publicId, asManager = false) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    await repo.addGroupMember(id, validatePublicId(publicId), asManager)
    if (get().members[id]) await refreshMembers(id)
    else scheduleConversationsRefresh()
  },

  async removeMember(conversationId, userId) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    const uid = validateUuid(userId)
    await repo.removeGroupMember(id, uid)
    removeMemberFromStore(id, uid)
  },

  async setMemberRole(conversationId, userId, role: MemberRole) {
    const me = requireReadyUser()
    const id = validateUuid(conversationId)
    const uid = validateUuid(userId)
    if (role !== 'manager' && role !== 'member') throw new ChatError('invalid-input', 'invalid_input')
    await repo.setGroupMemberRole(id, uid, role)
    // Realtime sends the same change; apply it now so the sheet updates at once.
    applyMembershipUpdate({ conversationId: id, userId: uid, memberRole: role, lastReadAt: null, joinedAt: null })
    if (uid === me) patchConversation(id, { myRole: role })
  },

  async setGroupAvatar(conversationId, image) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    const before = get().list.byId[id]?.avatarPath ?? null
    const stored = await replacePhoto('groups', id, image, (path) => repo.setGroupAvatar(id, path))
    patchConversation(id, { avatarPath: stored })
    if (before && before !== stored) void repo.removeAvatarObject(before)
  },

  async leaveGroup(conversationId) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    await repo.leaveGroup(id)
    removeConversation(id)
  },
}

type AdminMutations = Pick<AdminUsersState, 'verifyMonitor' | 'setRole' | 'setStudentMonitor'>

export const adminMutations: AdminMutations = {
  async verifyMonitor(userId, verified) {
    requireReadyUser()
    await repo.adminVerifyMonitor(validateUuid(userId), verified)
  },
  async setRole(userId, role) {
    requireReadyUser()
    if (role !== 'student' && role !== 'monitor') throw new ChatError('invalid-input', 'invalid_input')
    await repo.adminSetRole(validateUuid(userId), role)
  },
  async setStudentMonitor(studentPublicId, monitorPublicId) {
    requireReadyUser()
    await repo.adminSetStudentMonitor(validatePublicId(studentPublicId), monitorPublicId === null ? null : validatePublicId(monitorPublicId))
    // The admin may be a member of neither conversation; refresh in case they are.
    scheduleConversationsRefresh()
  },
}
