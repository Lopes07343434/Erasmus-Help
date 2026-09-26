import { useSearchParams } from 'react-router'
import { MessageCircle, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { useChatSession, useUnreadCounts } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { chatPanelId, chatTabId, parseChatTab, type ChatTab } from './chatPaths'
import { useSheetSwitch } from './chatHooks'
import { AddStudentSheet } from './components/AddStudentSheet'
import { ChatSessionState } from './components/ChatStates'
import { ChatTabs } from './components/ChatTabs'
import { ConversationListPanel } from './components/ConversationListPanel'
import { CreateGroupSheet } from './components/CreateGroupSheet'

const TABS_ID = 'chat-tabs'

/**
 * /chat?tab=conversas|grupos — people chat (students ↔ monitors, groups). Header and tabs render at once; the panel
 * follows the chat session (not configured / connecting / offline / error / ready).
 */
export default function ChatPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = parseChatTab(params.get('tab'))
  const session = useChatSession()
  const unread = useUnreadCounts()
  const sheets = useSheetSwitch<'addStudent' | 'createGroup'>()
  const me = session.me

  const selectTab = (next: ChatTab) => {
    if (next === tab) return
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'conversas') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('chat.title')} />
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
      <div role="tabpanel" id={chatPanelId(TABS_ID, tab)} aria-labelledby={chatTabId(TABS_ID, tab)} className="flex flex-col">
        {me && (session.status === 'ready' || session.status === 'offline') ? (
          <ConversationListPanel
            key={tab}
            kind={tab === 'grupos' ? 'group' : 'direct'}
            me={me}
            offline={session.status === 'offline'}
            onAddStudent={() => sheets.open('addStudent')}
            onCreateGroup={() => sheets.open('createGroup')}
          />
        ) : (
          <ChatSessionState session={session} />
        )}
      </div>

      <AddStudentSheet open={sheets.sheet === 'addStudent'} onClose={sheets.close} />
      {me ? <CreateGroupSheet open={sheets.sheet === 'createGroup'} onClose={sheets.close} me={me} /> : null}
    </div>
  )
}
