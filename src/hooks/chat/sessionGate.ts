import { AppError } from '@/services/errors'
import type { LoadStatus } from '@/services/chat/api'
import type { SessionState } from '@/services/chat/chatStore'
import { ChatError } from '@/services/chat/errors'

/** What data hooks show while the session is not ready (null = ready). */
export function sessionGate(session: SessionState): { status: Exclude<LoadStatus, 'success'>; error: AppError | null } | null {
  switch (session.status) {
    case 'ready':
      return null
    case 'idle':
    case 'connecting':
      return { status: 'loading', error: null }
    case 'not-configured':
      return { status: 'error', error: session.error ?? new ChatError('not-configured') }
    case 'offline':
      return { status: 'error', error: session.error ?? new AppError('offline') }
    case 'error':
      return { status: 'error', error: session.error ?? new AppError('unknown') }
  }
}
