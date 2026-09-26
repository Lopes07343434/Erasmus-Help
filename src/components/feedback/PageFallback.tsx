import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { GlassCard } from '@/components/ui/GlassCard'
import { Skeleton } from '@/components/ui/Skeleton'

const SHOW_AFTER_MS = 150

/**
 * Suspense fallback for lazy pages: a light skeleton of a page header + two cards. Rendered inside the
 * AppLayout content column (no own padding). Appears after 150ms so fast chunk loads don't flash.
 */
export function PageFallback() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [])

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-[22px] pt-1.5">
      <span className="sr-only">{t('common.status.loading')}</span>
      {visible ? (
        <>
          <div className="flex flex-col gap-2">
            <Skeleton width="38%" height={13} />
            <Skeleton width="62%" height={30} radius={8} />
          </div>
          <GlassCard className="flex items-center gap-3">
            <Skeleton width={40} height={40} radius={12} />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton width="55%" height={15} />
              <Skeleton width="80%" height={12} delay={0.15} />
            </div>
          </GlassCard>
          <GlassCard className="flex flex-col gap-2.5">
            <Skeleton width="92%" height={16} />
            <Skeleton width="64%" height={16} delay={0.15} />
          </GlassCard>
        </>
      ) : null}
    </div>
  )
}
