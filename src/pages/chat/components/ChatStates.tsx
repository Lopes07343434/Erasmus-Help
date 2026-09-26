import { Copy, Hourglass, MessageCircleOff, UserRoundSearch } from 'lucide-react'
import { ErrorState, LoadingState, StateView } from '@/components/feedback'
import { Button, GlassCard, IconTile, Skeleton } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ChatSession } from '@/services/chat/api'
import type { MyProfile } from '@/services/chat/types'
import { chatErrorCode } from '../chatErrors'
import { publicIdLabel } from '../chatFormat'
import { useCopyToClipboard } from '../chatHooks'

/** Loading placeholder for the conversation list: glass group with 4 rows (avatar + 2 lines). */
export function ConversationListSkeleton({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label ?? t('common.status.loading')}</span>
      <div className="glass overflow-hidden rounded-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-3 px-4 py-3">
            <Skeleton width={44} height={44} radius={22} />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton width={`${50 - i * 5}%`} height={14} />
              <Skeleton width={`${80 - i * 8}%`} height={12} delay={0.15} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Everything the chat shows while the session is not ready: not configured in this build, connecting (skeleton),
 * offline without cached data, or an error (anonymous sign-ins disabled, rate limited…) with retry.
 */
export function ChatSessionState({ session, variant = 'list' }: { session: ChatSession; variant?: 'list' | 'conversation' }) {
  const { t } = useI18n()
  switch (session.status) {
    case 'not-configured':
      return <StateView icon={MessageCircleOff} title={t('chat.session.notConfiguredTitle')} body={t('chat.session.notConfiguredBody')} />
    case 'offline':
      return <ErrorState code="offline" onRetry={session.retry} />
    case 'error': {
      const code = chatErrorCode(session.error)
      return code ? (
        <ErrorState title={t('chat.session.unavailableTitle')} body={t(`chat.errors.${code}`)} onRetry={session.retry} />
      ) : (
        <ErrorState error={session.error ?? undefined} code="unknown" onRetry={session.retry} />
      )
    }
    default:
      // 'connecting' (or 'ready' while the profile is still missing)
      return variant === 'list' ? <ConversationListSkeleton label={t('chat.session.connecting')} /> : <LoadingState label={t('chat.session.connecting')} />
  }
}

/** Student without a monitor yet: explains the monitor adds them by ID and shows it big with a copy button. */
export function StudentNoMonitor({ me }: { me: MyProfile }) {
  const { t } = useI18n()
  const copy = useCopyToClipboard()
  const id = publicIdLabel(me.publicId)
  return (
    <GlassCard as="section" padding="none" className="flex flex-col items-center gap-2.5 px-5 py-8 text-center">
      <IconTile icon={UserRoundSearch} variant="softLg" />
      <h2 className="m-0 text-base font-semibold">{t('chat.noMonitor.title')}</h2>
      <p className="m-0 max-w-[36ch] text-sm text-pretty text-text3">{t('chat.noMonitor.body')}</p>
      <p className="m-0 mt-2 flex flex-col items-center gap-1">
        <span className="text-[13px] font-semibold tracking-[.04em] text-text3 uppercase">{t('chat.id.yours')}</span>
        <span className="font-mono text-[34px] leading-[1.1] font-medium tracking-[.02em] text-primary select-all">{id}</span>
      </p>
      <Button variant="secondary" size="sm" icon={Copy} className="mt-1" aria-label={t('chat.id.copyAria', { id })} onClick={() => void copy(id)}>
        {t('chat.id.copy')}
      </Button>
    </GlassCard>
  )
}

/** Monitor account not verified yet (no monitor powers; groups they were added to still work). */
export function PendingMonitorBanner() {
  const { t } = useI18n()
  return (
    <GlassCard as="aside" padding="md" shadow={false} className="flex items-start gap-3">
      <IconTile icon={Hourglass} />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 text-[15px] leading-[1.3] font-semibold">{t('chat.pending.title')}</h2>
        <p className="m-0 text-[13px] leading-[1.45] text-pretty text-text2">{t('chat.pending.body')}</p>
      </div>
    </GlassCard>
  )
}
