/**
 * Group / student-association actions (validated inputs → RPC → local store update).
 * Every function throws AppError / ChatError (see errors.ts); the server re-validates everything.
 */
import type { AdminUsersState, GroupActions, StudentAssociation } from './api'
import { patchConversation, rememberProfiles, removeConversation, removeMember as removeMemberFromStore, useChatStore } from './chatStore'
import { ChatError } from './errors'
import { validateGroupName, validatePublicId, validateUuid } from './mappers'
import * as repo from './repository'
import { requireReadyUser } from './runtime'
import { refreshConversations, refreshMembers, scheduleConversationsRefresh } from './threads'
import { CHAT_LIMITS, type PublicProfile } from './types'

const get = useChatStore.getState

async function lookup(publicId: number): Promise<PublicProfile> {
  requireReadyUser()
  const profile = await repo.lookupProfileByPublicId(validatePublicId(publicId))
  rememberProfiles([profile])
  return profile
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

  async leaveGroup(conversationId) {
    requireReadyUser()
    const id = validateUuid(conversationId)
    await repo.leaveGroup(id)
    removeConversation(id)
  },

  lookupByPublicId: lookup,
}

export const studentAssociation: StudentAssociation = {
  async associateStudent(studentPublicId) {
    requireReadyUser()
    const id = await repo.associateStudent(validatePublicId(studentPublicId))
    await refreshConversations()
    return id
  },

  async removeAssociation(studentId) {
    requireReadyUser()
    await repo.removeStudentAssociation(validateUuid(studentId))
    await refreshConversations()
  },

  async lookupStudent(publicId) {
    const profile = await lookup(publicId)
    if (profile.role !== 'student') throw new ChatError('not-found', 'not_found')
    return profile
  },
}

type AdminMutations = Pick<AdminUsersState, 'verifyMonitor' | 'setCanManageGroups' | 'setRole' | 'setStudentMonitor'>

export const adminMutations: AdminMutations = {
  async verifyMonitor(userId, verified) {
    requireReadyUser()
    await repo.adminVerifyMonitor(validateUuid(userId), verified)
  },
  async setCanManageGroups(userId, value) {
    requireReadyUser()
    await repo.adminSetCanManageGroups(validateUuid(userId), value)
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
