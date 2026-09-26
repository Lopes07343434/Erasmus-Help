import { formatPublicIdNumber, type ConversationSummary, type MyProfile, type PublicProfile } from '@/services/chat/types'
import { canManageGroup, isAdmin } from '../chatPermissions'

type Me = Pick<MyProfile, 'id' | 'role'>

/** "07" (1–9 padded, from 10 on as is), or '' for a malformed number instead of throwing while rendering. */
export function publicIdNumber(publicId: number): string {
  try {
    return formatPublicIdNumber(publicId)
  } catch {
    return ''
  }
}

/** Leaving: group administrators and platform admins always can; plain members only when the group allows it. */
export const canLeaveGroup = (me: Me, conversation: Pick<ConversationSummary, 'allowLeave' | 'myRole'>): boolean =>
  conversation.allowLeave || conversation.myRole === 'manager' || isAdmin(me)

/** Removing someone else: group administrators (other administrators included); a platform admin only by a platform admin. */
export const canRemoveMember = (me: Me, conversation: Pick<ConversationSummary, 'myRole'>, member: Pick<PublicProfile, 'id' | 'role'>): boolean =>
  member.id !== me.id && canManageGroup(me, conversation) && (member.role !== 'admin' || isAdmin(me))

/** Promote / demote someone else. The server refuses it in archived groups, so the UI hides it there. */
export const canChangeMemberRole = (me: Me, conversation: Pick<ConversationSummary, 'myRole' | 'archivedAt'>, member: Pick<PublicProfile, 'id'>): boolean =>
  member.id !== me.id && conversation.archivedAt === null && canManageGroup(me, conversation)
