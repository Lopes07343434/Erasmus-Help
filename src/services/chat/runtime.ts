/**
 * Tiny shared runtime state of the chat data layer (avoids import cycles between modules).
 * `generation` changes on every teardown (sign-out, identity change): async results started
 * under an older generation are dropped.
 */
import { AppError } from '@/services/errors'
import { useChatStore } from './chatStore'
import { ChatError } from './errors'

let generation = 0

export const getGeneration = (): number => generation
export const bumpGeneration = (): number => ++generation

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

export function myUserId(): string | null {
  return useChatStore.getState().session.userId
}

/** The signed-in user id, or the reason why chat actions cannot run now. */
export function requireReadyUser(): string {
  const { session } = useChatStore.getState()
  if (session.status === 'ready' && session.userId) return session.userId
  if (session.status === 'not-configured') throw new ChatError('not-configured')
  if (session.error) throw session.error
  throw new AppError(isOffline() ? 'offline' : 'unavailable')
}
