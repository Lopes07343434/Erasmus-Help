import type { ConversationSummary, MyProfile } from '@/services/chat/types'

/**
 * What the signed-in user may do in the chat UI. Only decides which actions are shown: the server enforces the same
 * rules (and answers 'not_allowed', which the UI reports gracefully).
 */
type Me = Pick<MyProfile, 'role' | 'monitorStatus' | 'canManageGroups'> | null

export const isAdmin = (me: Me): boolean => me?.role === 'admin'

export const isVerifiedMonitor = (me: Me): boolean => me?.role === 'monitor' && me.monitorStatus === 'verified'

/** Monitor account waiting for an administrator: no monitor powers yet (groups they were added to still work). */
export const isPendingMonitor = (me: Me): boolean => me?.role === 'monitor' && me.monitorStatus !== 'verified'

/** "Adicionar aluno" in Conversas. */
export const canAddStudents = (me: Me): boolean => isVerifiedMonitor(me)

/** "Criar grupo" in Grupos. */
export const canCreateGroups = (me: Me): boolean => isAdmin(me) || (isVerifiedMonitor(me) && me?.canManageGroups === true)

/** Rename, add/remove participants, archive: admins, or verified monitors allowed to manage groups who manage this one. */
export const canManageGroup = (me: Me, conversation: Pick<ConversationSummary, 'myRole'>): boolean =>
  isAdmin(me) || (isVerifiedMonitor(me) && me?.canManageGroups === true && conversation.myRole === 'manager')

/** Hard delete: admins only. */
export const canDeleteGroup = (me: Me): boolean => isAdmin(me)
