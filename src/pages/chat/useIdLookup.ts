import { useCallback, useRef, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { parsePublicId, type PublicProfile } from '@/services/chat/types'
import { chatErrorMessage } from './chatErrors'
import { useLatest } from './chatHooks'

interface IdLookupOptions {
  /** Extra check on the person found (e.g. "not a student"): return an error message to reject it. */
  validate?: (profile: PublicProfile) => string | null
}

export interface IdLookupState {
  input: string
  setInput: (value: string) => void
  error: string | null
  busy: boolean
  /** The person found and accepted by `validate`. */
  found: PublicProfile | null
  /** Parses "07" / "ID 07", looks the person up and resolves with them (null when invalid, not found or rejected). */
  find: () => Promise<PublicProfile | null>
  reset: () => void
}

/** State of an "enter someone's ID → see their name and role" step (add student, add participant, create group). */
export function useIdLookup(lookup: (publicId: number) => Promise<PublicProfile>, options: IdLookupOptions = {}): IdLookupState {
  const i18n = useI18n()
  const [input, setInputState] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<PublicProfile | null>(null)
  const lookupRef = useLatest(lookup)
  const optionsRef = useLatest(options)
  const inputRef = useLatest(input)
  const run = useRef(0)

  const setInput = useCallback((value: string) => {
    run.current += 1
    setInputState(value)
    setError(null)
    setFound(null)
    setBusy(false)
  }, [])

  const find = useCallback(async (): Promise<PublicProfile | null> => {
    const publicId = parsePublicId(inputRef.current)
    if (publicId === null) {
      setError(i18n.t('chat.lookup.invalid'))
      return null
    }
    run.current += 1
    const id = run.current
    setBusy(true)
    setError(null)
    setFound(null)
    try {
      const profile = await lookupRef.current(publicId)
      if (id !== run.current) return null
      const rejected = optionsRef.current.validate?.(profile) ?? null
      setError(rejected)
      setFound(rejected ? null : profile)
      return rejected ? null : profile
    } catch (err) {
      if (id === run.current) setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
      return null
    } finally {
      if (id === run.current) setBusy(false)
    }
  }, [i18n, inputRef, lookupRef, optionsRef])

  const reset = useCallback(() => {
    run.current += 1
    setInputState('')
    setError(null)
    setFound(null)
    setBusy(false)
  }, [])

  return { input, setInput, error, busy, found, find, reset }
}
