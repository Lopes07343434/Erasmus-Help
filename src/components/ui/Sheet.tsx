import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from './cn'
import { IconButton } from './IconButton'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Dialog title (h2 18/700); also its accessible name. */
  title: string
  children: ReactNode
  /**
   * Element to focus on open. Otherwise the first element marked `data-autofocus` inside the sheet
   * (OptionList marks the selected option) or the panel itself.
   */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Keep the title for screen readers only. */
  hideTitle?: boolean
  className?: string
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'

/**
 * Bottom sheet dialog (portal to body): backdrop click / Esc / close button call onClose; focus is trapped,
 * moved inside on open and restored on close; page scroll is locked while open.
 * Render it unconditionally and drive it with `open` — it mounts only while open.
 */
export function Sheet(props: SheetProps) {
  if (!props.open || typeof document === 'undefined') return null
  return createPortal(<SheetPanel {...props} />, document.body)
}

function SheetPanel({ onClose, title, children, initialFocusRef, hideTitle, className }: SheetProps) {
  const { t } = useI18n()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  // Captured during the first render, before any child can take focus.
  const [returnFocus] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel
    target.focus({ preventScroll: true })

    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true',
      )
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!first || !last) {
        e.preventDefault()
        panel.focus()
      } else if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      html.style.overflow = prevOverflow
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [initialFocusRef, returnFocus])

  return (
    <div className="fixed inset-0 z-(--z-sheet) flex flex-col justify-end">
      <div aria-hidden="true" className="absolute inset-0 animate-eh-backdrop bg-(--backdrop)" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative mx-auto flex max-h-[85dvh] w-full animate-eh-sheet flex-col gap-3.5 rounded-t-sheet bg-surface-solid px-5 pt-2.5 pb-[max(34px,calc(env(safe-area-inset-bottom)_+_20px))] text-text shadow-[0_-10px_40px_-10px_rgba(0,0,0,.25)] outline-none lg:max-w-[480px]',
          className,
        )}
      >
        <div aria-hidden="true" className="h-[5px] w-10 shrink-0 self-center rounded-[3px] bg-border-strong" />
        <div className={cn('flex shrink-0 items-center gap-3', hideTitle ? 'justify-end' : 'justify-between')}>
          <h2 id={titleId} className={cn('m-0 text-lg font-bold', hideTitle && 'sr-only')}>
            {title}
          </h2>
          <IconButton variant="plain" icon={X} iconSize={20} aria-label={t('common.actions.close')} onClick={() => onCloseRef.current()} className="-mr-2.5" />
        </div>
        <div className="-mx-5 -my-1 flex min-h-0 flex-col gap-3.5 overflow-y-auto overscroll-contain px-5 py-1">{children}</div>
      </div>
    </div>
  )
}
