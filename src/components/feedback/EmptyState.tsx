import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StateView } from './StateView'

interface EmptyStateProps {
  icon?: LucideIcon
  title: ReactNode
  body?: ReactNode
  /** Optional action rendered as a small secondary button ("Limpar filtros"). */
  action?: { label: string; onClick: () => void; icon?: LucideIcon }
  className?: string
}

export function EmptyState({ icon = Inbox, title, body, action, className }: EmptyStateProps) {
  return (
    <StateView
      icon={icon}
      title={title}
      body={body}
      className={className}
      action={
        action ? (
          <Button variant="secondary" size="sm" icon={action.icon} onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null
      }
    />
  )
}
