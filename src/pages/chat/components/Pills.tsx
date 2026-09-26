import type { ReactNode } from 'react'
import { cn } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { UserRole } from '@/services/chat/types'

const ROLE_TONES: Record<UserRole, string> = {
  student: 'bg-primary-soft text-primary',
  monitor: 'bg-success-soft text-success',
  admin: 'bg-border text-text2',
}

const pillBase = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] leading-[1.35] font-semibold whitespace-nowrap'

/** Compact role pill (Aluno / Monitor / Admin) for rows, bubbles and headers (the StatusPill look at 11px). */
export function RolePill({ role, className }: { role: UserRole; className?: string }) {
  const { t } = useI18n()
  return <span className={cn(pillBase, ROLE_TONES[role], className)}>{t(`chat.roles.${role}`)}</span>
}

/** Compact neutral/primary pill (Gestor, Arquivado, Por verificar…). */
export function MiniPill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'primary' | 'success' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        pillBase,
        tone === 'primary'
          ? 'bg-primary-soft text-primary'
          : tone === 'success'
            ? 'bg-success-soft text-success'
            : tone === 'danger'
              ? 'bg-danger-soft text-danger'
              : 'border border-solid border-border text-text2',
        className,
      )}
    >
      {children}
    </span>
  )
}
