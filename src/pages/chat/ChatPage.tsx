import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { MessageCircle, Plus, UserPlus, Users } from 'lucide-react'
import { Button, cn, PageHeader } from '@/components/ui'
import { useChatSession, useConversations, useUnreadCounts } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { useNow, useSheetSwitch } from './chatHooks'
import { chatPanelId, chatTabId, parseChatTab, type ChatTab } from './chatPaths'
import { useChatSearch } from './chatSearch'
import { AddPersonSheet } from './components/AddPersonSheet'
import { ChatSearchResults } from './components/ChatSearchResults'
import { ChatSessionState } from './components/ChatStates'
import { ChatTabs } from './components/ChatTabs'
import { ConversationListPanel } from './components/ConversationListPanel'
import { CreateGroupSheet } from './components/CreateGroupSheet'
import { PeopleSearchField } from './components/PeopleSearch'

const TABS_ID = 'chat-tabs'

interface ChatPageProps {
  /** Desktop split view: rendered as the left column (fixed top, own scroll) next to the open conversation. */
  pane?: boolean
  /** Conversation open next to the list (split view): highlighted, and its kind picks the tab when the URL has none. */
  activeConversationId?: string | null
}

/**
 * /chat?tab=conversas|grupos — people chat. Header (with the tab's action: "Adicionar pessoa" / "Criar grupo"),
 * search (name, ID or group) and tabs render at once; the content follows the chat session (not configured /
 * connecting / offline / error / ready). While the search has text, results replace the tabs.
 */
export default function ChatPage({ pane = false, activeConversationId = null }: ChatPageProps) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const session = useChatSession()
  const unread = useUnreadCounts()
  const direct = useConversations('direct')
  const groups = useConversations('group')
  const sheets = useSheetSwitch<'addPerson' | 'createGroup'>()
  const now = useNow()
  const [query, setQuery] = useState('')
  const search = useChatSearch(query, { direct: direct.items, groups: groups.items })
  const me = session.me
  const ready = me !== null && (session.status === 'ready' || session.status === 'offline')
  const offline = session.status === 'offline'
  const searching = ready && query.trim() !== ''

  // An explicit ?tab= wins; otherwise the open conversation's kind (e.g. a group opened from a notification).
  const tabParam = params.get('tab')
  const tab: ChatTab =
    tabParam !== null ? parseChatTab(tabParam) : activeConversationId !== null && groups.items.some((c) => c.id === activeConversationId) ? 'grupos' : 'conversas'

  const selectTab = (next: ChatTab) => {
    if (next === tab) return
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        // Next to an open conversation the choice must be explicit (it overrides the conversation's kind).
        if (next === 'conversas' && activeConversationId === null) p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }

  const action =
    tab === 'grupos'
      ? { label: t('chat.actions.createGroup'), icon: Plus, onClick: () => sheets.open('createGroup') }
      : { label: t('chat.actions.addPerson'), icon: UserPlus, onClick: () => sheets.open('addPerson') }

  let content
  if (!ready || !me) {
    content = <ChatSessionState session={session} />
  } else if (searching) {
    content = <ChatSearchResults search={search} me={me} now={now} offline={offline} activeConversationId={activeConversationId} />
  } else {
    content = (
      <ConversationListPanel
        key={tab}
        kind={tab === 'grupos' ? 'group' : 'direct'}
        list={tab === 'grupos' ? groups : direct}
        me={me}
        now={now}
        offline={offline}
        activeConversationId={activeConversationId}
        onAddPerson={() => sheets.open('addPerson')}
        onCreateGroup={() => sheets.open('createGroup')}
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', pane && 'h-full px-5 pt-(--eh-content-pt)')}>
      <div className={cn('flex flex-col gap-4', pane && 'shrink-0')}>
        <PageHeader
          title={t('chat.title')}
          actions={
            ready ? (
              <Button variant="secondary" size="sm" icon={action.icon} onClick={action.onClick}>
                {action.label}
              </Button>
            ) : null
          }
        />
        <PeopleSearchField
          value={query}
          onChange={setQuery}
          label={t('chat.search.label')}
          hideLabel
          placeholder={t('chat.search.placeholder')}
          disabled={!ready}
          onSubmit={search.submit}
        />
        {searching ? null : (
          <ChatTabs<ChatTab>
            id={TABS_ID}
            aria-label={t('chat.tabs.label')}
            value={tab}
            onChange={selectTab}
            options={[
              { value: 'conversas', label: t('chat.tabs.direct'), icon: MessageCircle, count: unread.direct },
              { value: 'grupos', label: t('chat.tabs.groups'), icon: Users, count: unread.groups },
            ]}
          />
        )}
      </div>
      <div
        {...(searching ? { role: 'region', 'aria-label': t('chat.search.results') } : { role: 'tabpanel', id: chatPanelId(TABS_ID, tab), 'aria-labelledby': chatTabId(TABS_ID, tab) })}
        className={cn('flex flex-col', pane && '-mx-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-0.5 pb-8')}
      >
        {content}
      </div>

      {me ? (
        <>
          <AddPersonSheet open={sheets.sheet === 'addPerson'} onClose={sheets.close} me={me} />
          <CreateGroupSheet open={sheets.sheet === 'createGroup'} onClose={sheets.close} />
        </>
      ) : null}
    </div>
  )
}
