import type { ConversationSummary, MyProfile } from '@/services/chat/types'

/**
 * What the signed-in user may do in the chat UI. Only decides which actions are shown: the server enforces the same
 * rules (and answers 'not_allowed', which the UI reports gracefully).
 *
 * Everyone with a chat account can add people by ID and create groups; whoever creates a group becomes its
 * administrator ('manager'). Platform admins can manage every group.
 */
type Me = Pick<MyProfile, 'role'> | null

export const isAdmin = (me: Me): boolean => me?.role === 'admin'

/** "+ Criar grupo". */
export const canCreateGroups = (me: Me): boolean => me !== null

/** Rename, change the photo, add/remove participants, promote/demote administrators, archive. */
export const canManageGroup = (me: Me, conversation: Pick<ConversationSummary, 'myRole'>): boolean => isAdmin(me) || conversation.myRole === 'manager'

/** Hard delete: platform admins only. */
export const canDeleteGroup = (me: Me): boolean => isAdmin(me)
