import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { ToastContext, type ToastApi, type ToastOptions } from './toastContext'

interface ToastState {
  id: number
  message: string
  icon: LucideIcon | null
}

/**
 * Provides `useToast()`. The toast is a pill (bg text / color bg, 14/600) centred above the bottom nav
 * (bottom = --eh-toast-bottom set by AppLayout; falls back to 24px + safe area, e.g. in onboarding).
 * The live region is always mounted so screen readers announce each message.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seq = useRef(0)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback((message: string, options?: ToastOptions) => {
    clearTimeout(timer.current)
    seq.current += 1
    setToast({ id: seq.current, message, icon: options?.icon === undefined ? Check : options.icon })
    timer.current = setTimeout(() => setToast(null), options?.duration ?? 1900)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide])
  const Icon = toast?.icon

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-0 bottom-[var(--eh-toast-bottom,calc(24px_+_env(safe-area-inset-bottom)))] left-[var(--eh-sidebar-w,0px)] z-(--z-toast) flex justify-center px-4"
      >
        {toast ? (
          <div
            key={toast.id}
            className="flex max-w-full animate-[ehFade_.2s_ease_both] items-center gap-2 rounded-control bg-text px-4 py-[11px] text-sm font-semibold text-bg shadow-[0_10px_30px_-10px_rgba(0,0,0,.4)]"
          >
            {Icon ? <Icon size={14} aria-hidden="true" className="shrink-0" /> : null}
            <span>{toast.message}</span>
          </div>
        ) : null}
      </div>
    </ToastContext>
  )
}
