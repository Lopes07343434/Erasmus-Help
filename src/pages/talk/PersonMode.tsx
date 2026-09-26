import { useState } from 'react'
import { OptionList, Sheet, type OptionItem } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { LANGUAGES, type LanguageCode } from '@/i18n/languages'
import { BridgeRow } from './BridgeRow'
import { SpeakerPanel } from './SpeakerPanel'
import type { Speaker } from './talkStore'
import type { PersonConversation } from './usePersonConversation'

/**
 * "Conversar com pessoa": two people at the same table share one phone laid between them.
 * Person B (top, rotated 180°) ↔ the translation bridge ↔ person A (bottom, the phone owner).
 */
export function PersonMode({ conversation }: { conversation: PersonConversation }) {
  const { t, languageName } = useI18n()
  const [sheetFor, setSheetFor] = useState<Speaker | null>(null)
  const { languages, panels, snapshot, bridge } = conversation

  const options: OptionItem<LanguageCode>[] = LANGUAGES.map((l) => ({
    value: l.code,
    label: languageName(l.code),
    badge: l.short,
    description: l.nativeName !== languageName(l.code) ? l.nativeName : undefined,
  }))
  const sheetTitle = t(sheetFor === 'b' ? 'talk.person.sheet.other' : 'talk.person.sheet.mine')

  const panel = (side: Speaker) => (
    <SpeakerPanel
      side={side}
      language={languages[side]}
      model={panels[side]}
      label={t(side === 'a' ? 'talk.person.sideA' : 'talk.person.sideB')}
      rotated={side === 'b'}
      onTalk={() => conversation.talk(side)}
      onReplay={conversation.replay}
      onChangeLanguage={() => setSheetFor(side)}
    />
  )

  return (
    <div className="relative flex flex-1 animate-eh-fade flex-col gap-1.5">
      {panel('b')}
      <BridgeRow bridge={bridge} snapshot={snapshot} />
      {panel('a')}

      <Sheet open={sheetFor !== null} onClose={() => setSheetFor(null)} title={sheetTitle}>
        <OptionList<LanguageCode>
          aria-label={sheetTitle}
          options={options}
          value={sheetFor ? languages[sheetFor] : null}
          onChange={(code) => {
            if (sheetFor) conversation.setLanguage(sheetFor, code)
            setSheetFor(null)
          }}
        />
      </Sheet>
    </div>
  )
}
