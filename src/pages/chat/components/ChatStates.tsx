import { Copy, MessageCircleOff } from 'lucide-react'
import { ErrorState, LoadingState, StateView } from '@/components/feedback'
import { Button, GlassCard, Skeleton } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ChatSession } from '@/services/chat/api'
import { formatPublicIdNumber, type MyProfile } from '@/services/chat/types'
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

/**
 * "O teu ID · 07 · Copiar ID": shown under the empty conversation list so the user can share their ID and be added.
 * Copies "ID: 07" (like the Profile; the search accepts it as typed).
 */
export function MyIdCard({ me }: { me: MyProfile }) {
  const { t } = useI18n()
  const copy = useCopyToClipboard()
  const id = publicIdLabel(me.publicId)
  if (!id) return null
  const number = formatPublicIdNumber(me.publicId)
  return (
    <GlassCard as="section" padding="md" shadow={false} aria-label={t('chat.id.yours')} className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 text-xs font-semibold tracking-[.04em] text-text3 uppercase">{t('chat.id.yours')}</p>
        <p className="m-0 font-mono text-[26px] leading-[1.1] font-medium text-primary tabular-nums select-all">{number}</p>
        <p className="m-0 text-[13px] leading-[1.4] text-pretty text-text3">{t('chat.id.hint')}</p>
      </div>
      <Button variant="secondary" size="sm" icon={Copy} aria-label={t('chat.id.copyAria', { id })} onClick={() => void copy(id)}>
        {t('chat.id.copy')}
      </Button>
    </GlassCard>
  )
}
