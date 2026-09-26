import { useEffect, type RefObject } from 'react'

/** Moves focus to `ref` whenever `key` changes (e.g. the step heading), so screen readers announce the new screen. */
export function useFocusOnChange(ref: RefObject<HTMLElement | null>, key: string | number, enabled = true) {
  useEffect(() => {
    if (enabled) ref.current?.focus()
  }, [ref, key, enabled])
}
