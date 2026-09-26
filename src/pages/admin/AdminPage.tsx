import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Search, ShieldAlert, Users } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { EmptyState, ErrorState } from '@/components/feedback'
import { IconButton, ListRow, ListSection, PageHeader, TextField } from '@/components/ui'
import { useAdminUsers, useChatSession } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import type { AdminUserRow } from '@/services/chat/api'
import { publicIdLabel } from '@/pages/chat/chatFormat'
import { ChatAvatar } from '@/pages/chat/components/ChatAvatar'
import { ChatSessionState, ConversationListSkeleton } from '@/pages/chat/components/ChatStates'
import { MiniPill, RolePill } from '@/pages/chat/components/Pills'
import { AdminUserSheet } from './components/AdminUserSheet'
import { AssignMonitorCard } from './components/AssignMonitorCard'

/**
 * /admin — chat administration (reached from Definições, admins only): search users; verify monitors, role
 * student ↔ monitor, and a student's monitor. Group rights are per group (its administrators), not set here.
 * The server enforces admin rights; others see "Sem acesso".
 */
export default function AdminPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const session = useChatSession()
  const me = session.me

  let content
  if (!me || session.status !== 'ready') content = <ChatSessionState session={session} />
  else if (me.role !== 'admin') content = <ErrorState icon={ShieldAlert} title={t('chat.admin.noAccessTitle')} body={t('chat.admin.noAccessBody')} />
  else content = <AdminDirectory />

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="-mb-3 -ml-2.5">
        <IconButton variant="plain" icon={ArrowLeft} aria-label={t('chat.admin.back')} onClick={() => void navigate(ROUTES.settings)} />
      </div>
      <PageHeader title={t('chat.admin.title')} subtitle={t('chat.admin.subtitle')} />
      {content}
    </div>
  )
}

function UserRow({ user, onOpen }: { user: AdminUserRow; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <ListRow
      leading={<ChatAvatar name={user.displayName} photo={user.avatarPath} size={40} />}
      label={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="break-words">{user.displayName}</span>
          <span className="font-mono text-xs font-medium text-text3">{publicIdLabel(user.publicId)}</span>
        </span>
      }
      description={
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <RolePill role={user.role} />
          {user.role === 'monitor' ? (
            <MiniPill tone={user.monitorStatus === 'verified' ? 'success' : 'danger'}>
              {t(user.monitorStatus === 'verified' ? 'chat.admin.status.verified' : 'chat.admin.status.pending')}
            </MiniPill>
          ) : null}
          {user.role === 'student' ? (
            <span>{user.monitor ? t('chat.admin.monitorOf', { name: `${user.monitor.displayName} (${publicIdLabel(user.monitor.publicId)})` }) : t('chat.admin.noMonitor')}</span>
          ) : null}
        </span>
      }
      onClick={onOpen}
    />
  )
}

function AdminDirectory() {
  const { t } = useI18n()
  const admin = useAdminUsers()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? (admin.items.find((u) => u.id === selectedId) ?? null) : null

  const search = (value: string) => {
    setQuery(value)
    admin.search(value)
  }

  let results
  if (admin.items.length === 0 && admin.status === 'loading') results = <ConversationListSkeleton />
  else if (admin.items.length === 0 && admin.status === 'error') results = <ErrorState error={admin.error ?? undefined} onRetry={() => admin.search(query)} />
  else if (admin.items.length === 0) results = <EmptyState icon={Users} title={t('chat.admin.emptyTitle')} body={t('chat.admin.emptyBody')} />
  else
    results = (
      <ListSection title={t('chat.admin.results')}>
        {admin.items.map((user) => (
          <UserRow key={user.id} user={user} onOpen={() => setSelectedId(user.id)} />
        ))}
      </ListSection>
    )

  return (
    <>
      <TextField
        type="search"
        label={t('chat.admin.searchLabel')}
        hideLabel
        placeholder={t('chat.admin.searchPlaceholder')}
        leadingIcon={Search}
        value={query}
        onChange={(e) => search(e.target.value)}
        onClear={() => search('')}
        autoComplete="off"
        enterKeyHint="search"
      />
      <div aria-busy={admin.status === 'loading'} className="flex flex-col">
        {results}
      </div>
      <AssignMonitorCard onAssign={admin.setStudentMonitor} />
      <AdminUserSheet user={selected} onClose={() => setSelectedId(null)} admin={admin} />
    </>
  )
}
