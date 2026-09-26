import { useI18n } from '@/i18n/I18nProvider'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/components/ui/cn'

/** Centered primary spinner + label (default common.status.loading). role="status". */
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useI18n()
  return (
    <div role="status" className={cn('flex flex-col items-center gap-2.5 px-5 py-10 text-center', className)}>
      <Spinner size={24} className="text-primary" />
      <span className="text-sm text-text3">{label ?? t('common.status.loading')}</span>
    </div>
  )
}
