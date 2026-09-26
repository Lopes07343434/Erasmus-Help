import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { IconTile } from '@/components/ui/IconTile'
import { cn } from '@/components/ui/cn'

interface StateViewProps {
  icon: LucideIcon
  tone?: 'primary' | 'danger'
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  /** role/aria-live for the text block (errors use role="alert"). */
  textRole?: 'alert' | 'status'
  className?: string
}

/** Layout of the prototype "Sem resultados" block: 52px tinted tile, title 16/600, body 14 text3, action. */
export function StateView({ icon, tone = 'primary', title, body, action, textRole, className }: StateViewProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5 px-5 py-10 text-center', className)}>
      <IconTile icon={icon} variant="softLg" tone={tone} />
      <div role={textRole} className="flex flex-col items-center gap-2.5">
        <p className="m-0 text-base font-semibold text-text">{title}</p>
        {body ? <p className="m-0 max-w-[36ch] text-sm text-pretty text-text3">{body}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
