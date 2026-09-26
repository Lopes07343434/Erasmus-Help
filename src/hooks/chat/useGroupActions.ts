import { useEffect } from 'react'
import { groupActions, studentAssociation } from '@/services/chat/actions'
import type { GroupActions, StudentAssociation } from '@/services/chat/api'
import { startChat } from '@/services/chat/session'

/**
 * Group management (stable object). Inputs are validated first (group name 1..60 after cleaning,
 * public ids ≥ 1, uuids) → ChatError('invalid-input'); server refusals come as ChatError with
 * `detail` = not_allowed | not_found | already_member | archived | last_manager | not_verified.
 */
export function useGroupActions(): GroupActions {
  useEffect(() => startChat(), [])
  return groupActions
}

/** Verified monitor ↔ student (stable object). lookupStudent rejects non-students with not-found. */
export function useStudentAssociation(): StudentAssociation {
  useEffect(() => startChat(), [])
  return studentAssociation
}
