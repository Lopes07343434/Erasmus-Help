import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppError } from '@/services/errors'
import { adminMutations } from '@/services/chat/actions'
import type { AdminUserRow, AdminUsersState, LoadStatus } from '@/services/chat/api'
import { useChatStore } from '@/services/chat/chatStore'
import { ChatError, toChatError } from '@/services/chat/errors'
import { cleanLine } from '@/services/chat/mappers'
import { adminListUsers } from '@/services/chat/repository'
import { startChat } from '@/services/chat/session'
import { sessionGate } from './sessionGate'

export const ADMIN_SEARCH_DEBOUNCE_MS = 300

interface ListState {
  status: LoadStatus
  items: AdminUserRow[]
  error: AppError | null
}

/**
 * Admin user directory (admin_list_users, up to 100 rows). search("ID 7" | "#7" | "7" | name part) is
 * debounced; every mutation reloads the current search. Non-admins get status 'error' / permission-denied
 * without any request.
 */
export function useAdminUsers(): AdminUsersState {
  const session = useChatStore((s) => s.session)
  const [query, setQuery] = useState('')
  const [nonce, setNonce] = useState(0)
  const [list, setList] = useState<ListState>({ status: 'loading', items: [], error: null })
  useEffect(() => startChat(), [])

  const ready = session.status === 'ready'
  const isAdmin = session.me?.role === 'admin'

  useEffect(() => {
    if (!ready || !isAdmin) return
    let cancelled = false
    const timer = setTimeout(
      () => {
        adminListUsers(query || null).then(
          (items) => {
            if (!cancelled) setList({ status: 'success', items, error: null })
          },
          (err: unknown) => {
            if (!cancelled) setList((s) => ({ status: 'error', items: s.items, error: toChatError(err) }))
          },
        )
      },
      query ? ADMIN_SEARCH_DEBOUNCE_MS : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ready, isAdmin, query, nonce])

  const search = useCallback((q: string) => setQuery(cleanLine(q).slice(0, 100)), [])

  const mutations = useMemo(() => {
    const reload = () => setNonce((n) => n + 1)
    const wrap =
      <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      async (...args: A) => {
        await fn(...args)
        reload()
      }
    return {
      verifyMonitor: wrap(adminMutations.verifyMonitor),
      setCanManageGroups: wrap(adminMutations.setCanManageGroups),
      setRole: wrap(adminMutations.setRole),
      setStudentMonitor: wrap(adminMutations.setStudentMonitor),
    }
  }, [])

  return useMemo<AdminUsersState>(() => {
    const gate = sessionGate(session)
    if (gate) return { status: gate.status, items: [], error: gate.error, search, ...mutations }
    if (!isAdmin) return { status: 'error', items: [], error: new ChatError('permission-denied', 'not_allowed'), search, ...mutations }
    return { ...list, search, ...mutations }
  }, [session, isAdmin, list, search, mutations])
}
