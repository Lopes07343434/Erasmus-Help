import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { CircleAlert } from 'lucide-react'
import { useToast } from '@/components/ui'
import { useDirectChats, usePeopleSearch } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import type { PeopleSearchState } from '@/services/chat/api'
import { searchableQuery } from '@/services/chat/mappers'
import { formatPublicIdNumber, isPublicIdQuery, parsePublicId, type ConversationSummary, type PersonSearchResult } from '@/services/chat/types'
import { chatErrorMessage } from './chatErrors'
import { useLatest } from './chatHooks'
import { conversationPath } from './chatPaths'

/** Case- and accent-insensitive form of a text ("Milão" → "milao"). */
export const foldText = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/**
 * Does this public ID answer an ID query ("15", "07", "ID: 07")? The exact number, or an ID whose displayed form
 * starts with the digits as typed: "1" → 01, 10–19, 100…; "01" → only 01 (never 10 or 100).
 */
export function publicIdMatches(publicId: number, query: string): boolean {
  const exact = parsePublicId(query)
  if (exact === null) return false
  if (publicId === exact) return true
  const digits = /\d+/.exec(query)?.[0] ?? ''
  try {
    return formatPublicIdNumber(publicId).startsWith(digits)
  } catch {
    return false
  }
}

export interface ConversationMatches {
  direct: ConversationSummary[]
  groups: ConversationSummary[]
}

/**
 * Local part of the Chat search (no request): my direct chats whose person matches by name or ID (exact ID first) and
 * my groups whose name matches. `query` is already cleaned (searchableQuery). The lists' order (most recent first) is kept.
 */
export function searchConversations(direct: readonly ConversationSummary[], groups: readonly ConversationSummary[], query: string): ConversationMatches {
  const needle = foldText(query)
  const byName = (name: string | null | undefined) => !!name && foldText(name).includes(needle)
  const idQuery = isPublicIdQuery(query)
  const exactId = idQuery ? parsePublicId(query) : null
  const directMatches = direct.filter((c) => c.otherUser !== null && (byName(c.otherUser.displayName) || (idQuery && publicIdMatches(c.otherUser.publicId, query))))
  if (exactId !== null) {
    const isExact = (c: ConversationSummary) => Number(c.otherUser?.publicId === exactId)
    directMatches.sort((a, b) => isExact(b) - isExact(a))
  }
  return { direct: directMatches, groups: groups.filter((c) => byName(c.name)) }
}

/**
 * Enter in a people search: `pick` the exact-ID match. When the (debounced) search is still running, waits for its
 * answer instead of dropping the key press; typing on cancels the wait.
 */
export function useExactMatchSubmit(search: PeopleSearchState, pick: (person: PersonSearchResult) => void): () => void {
  /** The query Enter was pressed for while its answer was still loading. */
  const pending = useRef<string | null>(null)
  const pickRef = useLatest(pick)
  const { status, query } = search
  const exact = status === 'success' ? (search.results.find((p) => p.exactIdMatch) ?? null) : null

  useEffect(() => {
    if (pending.current === null || status === 'loading') return
    const waitedFor = pending.current
    pending.current = null
    if (exact && query === waitedFor) pickRef.current(exact)
  }, [status, query, exact, pickRef])

  return useCallback(() => {
    pending.current = null
    if (exact) pickRef.current(exact)
    else if (status === 'loading') pending.current = query
  }, [exact, status, query, pickRef])
}

export interface ChatSearch {
  /** Cleaned query; null when there is nothing to search yet (empty, or a single letter). */
  query: string | null
  /** True for an ID query ("15", "ID: 07"): rows lead with the ID. */
  idQuery: boolean
  direct: ConversationSummary[]
  groups: ConversationSummary[]
  /** Server people search (by ID or name), minus the people already listed under `direct`. */
  people: PeopleSearchState
  /** Person whose conversation is being opened (their button shows a spinner). */
  openingId: string | null
  /** Opens (or creates) the direct conversation with this person, then navigates to it. */
  openPerson: (person: PersonSearchResult) => void
  /** Enter: the exact-ID conversation if I have one, else the exact-ID person. */
  submit: () => void
}

/** The Chat screen's global search: local matches in my conversations and groups, plus the people directory. */
export function useChatSearch(raw: string, lists: { direct: ConversationSummary[]; groups: ConversationSummary[] }): ChatSearch {
  const i18n = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const directChats = useDirectChats()
  const search = usePeopleSearch(raw)
  const query = searchableQuery(raw)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const opening = useRef(false)

  const matches = useMemo(() => (query === null ? { direct: [], groups: [] } : searchConversations(lists.direct, lists.groups, query)), [lists.direct, lists.groups, query])

  const results = useMemo(() => {
    const listed = new Set(matches.direct.map((c) => c.otherUser?.id))
    return search.results.filter((p) => !listed.has(p.id))
  }, [search.results, matches.direct])
  const people: PeopleSearchState = { ...search, results }

  const openPerson = useCallback(
    (person: PersonSearchResult) => {
      if (opening.current) return
      opening.current = true
      setOpeningId(person.id)
      directChats.startDirectConversation(person.publicId).then(
        (conversationId) => {
          opening.current = false
          setOpeningId(null)
          void navigate(conversationPath(conversationId))
        },
        (err: unknown) => {
          opening.current = false
          setOpeningId(null)
          toast.show(chatErrorMessage(err, i18n, { notFound: 'person' }), { icon: CircleAlert, duration: 3200 })
        },
      )
    },
    [directChats, navigate, toast, i18n],
  )

  const submitPerson = useExactMatchSubmit(people, openPerson)
  const idQuery = query !== null && isPublicIdQuery(query)
  const exactId = query !== null && idQuery ? parsePublicId(query) : null
  const submit = () => {
    if (exactId === null) return
    const chat = matches.direct.find((c) => c.otherUser?.publicId === exactId)
    if (chat) void navigate(conversationPath(chat.id))
    else submitPerson()
  }

  return { query, idQuery, direct: matches.direct, groups: matches.groups, people, openingId, openPerson, submit }
}
