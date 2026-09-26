import { useEffect } from 'react'
import { directChatActions, groupActions, profileActions, studentAssociation } from '@/services/chat/actions'
import type { DirectChatActions, GroupActions, ProfileActions, StudentAssociation } from '@/services/chat/api'
import { startChat } from '@/services/chat/session'

/**
 * Group management (stable object). Inputs are validated first (group name 1..60 after cleaning,
 * public ids ≥ 1, uuids) → ChatError('invalid-input'); server refusals come as ChatError with
 * `detail` = not_allowed | not_found | already_member | archived | last_manager.
 * Anyone can create a group (and administers it); the other actions need group administrator rights.
 */
export function useGroupActions(): GroupActions {
  useEffect(() => startChat(), [])
  return groupActions
}

/** "Adicionar pessoa" (stable object): opens the direct conversation with a public ID. */
export function useDirectChats(): DirectChatActions {
  useEffect(() => startChat(), [])
  return directChatActions
}

/** My profile photo (stable object). */
export function useProfileActions(): ProfileActions {
  useEffect(() => startChat(), [])
  return profileActions
}

/** Verified monitor ↔ student (stable object). lookupStudent rejects non-students with not-found. */
export function useStudentAssociation(): StudentAssociation {
  useEffect(() => startChat(), [])
  return studentAssociation
}
