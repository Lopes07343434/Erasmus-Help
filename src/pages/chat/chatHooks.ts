import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'

/** Current time, refreshed every `intervalMs` (relative labels like "Hoje"/"Ontem" roll over at midnight). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Ref that always holds the latest value (for callbacks given by data hooks whose identity may change every render). */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

/** Copies text to the clipboard with a toast ("ID copiado" / failure). Clipboard needs a secure context. */
export function useCopyToClipboard(successMessage?: string) {
  const toast = useToast()
  const { t } = useI18n()
  return useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.show(successMessage ?? t('chat.id.copied'))
      } catch {
        toast.show(t('chat.id.copyFailed'), { icon: CircleAlert, duration: 3200 })
      }
    },
    [toast, t, successMessage],
  )
}

/**
 * Height of the on-screen keyboard (or anything else covering the bottom of the layout viewport), from the
 * VisualViewport API: iOS/Android overlay the keyboard instead of resizing the page, so a bottom-sticky composer
 * uses this as its `bottom` offset. 0 when unsupported or when the browser already panned the page.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop)
        // Ignore small differences (collapsing URL bar, rounding).
        setInset(covered > 60 ? covered : 0)
      })
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/** Opens one of several sheets. Switching waits a frame so the closing sheet can hand focus back first. */
export function useSheetSwitch<T extends string>() {
  const [sheet, setSheet] = useState<T | null>(null)
  const current = useLatest(sheet)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const open = useCallback(
    (next: T) => {
      cancelAnimationFrame(frame.current)
      if (current.current === null) return setSheet(next)
      setSheet(null)
      frame.current = requestAnimationFrame(() => setSheet(next))
    },
    [current],
  )
  const close = useCallback(() => {
    cancelAnimationFrame(frame.current)
    setSheet(null)
  }, [])
  return { sheet, open, close }
}
