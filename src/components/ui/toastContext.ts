import { createContext, use } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ToastOptions {
  /** Leading icon (default Check). Pass `null` for none. */
  icon?: LucideIcon | null
  /** Auto-hide delay in ms (default 1900, as in the prototype). */
  duration?: number
}

export interface ToastApi {
  /** Shows a toast, replacing the current one. */
  show: (message: string, options?: ToastOptions) => void
  hide: () => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
