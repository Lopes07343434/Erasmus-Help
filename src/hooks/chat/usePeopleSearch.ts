import { useCallback, useEffect, useState } from 'react'
import { peopleActions } from '@/services/chat/actions'
import type { PeopleSearchState } from '@/services/chat/api'
import { useChatStore } from '@/services/chat/chatStore'
import { searchableQuery } from '@/services/chat/mappers'
import { startChat } from '@/services/chat/session'
import type { PersonSearchResult } from '@/services/chat/types'
import { toAppError, type AppError } from '@/services/errors'

const EMPTY: PersonSearchResult[] = []
export const PEOPLE_SEARCH_DEBOUNCE_MS = 250

interface Snapshot {
  key: string
  status: 'success' | 'error'
  results: PersonSearchResult[]
  error: AppError | null
}

/**
 * Live people search (by ID or name) for "Adicionar pessoa", "Criar grupo", "Adicionar membro" and the Chat
 * search. Debounced; only the latest query's answer is applied (older in-flight answers are dropped). While a new
 * query loads, the previous results stay available (`stale: true`) so the list does not flicker.
 */
export function usePeopleSearch(query: string, { enabled = true, debounceMs = PEOPLE_SEARCH_DEBOUNCE_MS }: { enabled?: boolean; debounceMs?: number } = {}): PeopleSearchState {
  useEffect(() => startChat(), [])
  const ready = useChatStore((s) => s.session.status === 'ready')
  const [nonce, setNonce] = useState(0)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const q = searchableQuery(query)
  const active = enabled && ready && q !== null
  const key = `${nonce}\u0000${q ?? ''}`

  useEffect(() => {
    if (!active || q === null) return
    let alive = true
    const timer = setTimeout(() => {
      peopleActions.search(q).then(
        (results) => {
          if (alive) setSnap({ key, status: 'success', results, error: null })
        },
        (err: unknown) => {
          if (alive) setSnap({ key, status: 'error', results: EMPTY, error: toAppError(err) })
        },
      )
    }, debounceMs)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [active, q, key, debounceMs])

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  if (!active) return { status: 'idle', query: q ?? '', results: EMPTY, stale: false, error: null, retry }
  if (snap?.key === key) return { status: snap.status, query: q, results: snap.results, stale: false, error: snap.error, retry }
  return { status: 'loading', query: q, results: snap?.results ?? EMPTY, stale: (snap?.results.length ?? 0) > 0, error: null, retry }
}
