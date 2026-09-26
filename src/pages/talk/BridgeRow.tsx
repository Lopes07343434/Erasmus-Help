import { ChevronDown, ChevronUp } from 'lucide-react'
import { ConversationSphere } from '@/components/sphere'
import { cn } from '@/components/ui'
import { errorI18nKey } from '@/components/feedback'
import { useI18n } from '@/i18n/I18nProvider'
import { getLanguage } from '@/i18n/languages'
import { resultSpeaker, type BridgeModel, type PersonSnapshot } from './personModel'
import { useInlineLanguageName, useShortViewport } from './talkHooks'
import { otherSpeaker } from './talkStore'

interface BridgeRowProps {
  bridge: BridgeModel
  snapshot: PersonSnapshot
}

/**
 * Middle row between the two panels: language pair chip · the translation bridge (sphere "anel", reacting to
 * the communication state — it is not a person) with flow chevrons · status text (role=status).
 */
export function BridgeRow({ bridge, snapshot }: BridgeRowProps) {
  const { t } = useI18n()
  const inlineName = useInlineLanguageName()
  const short = useShortViewport()
  const { languages, active } = snapshot
  const { state, flowFrom } = bridge

  let status: string
  switch (state) {
    case 'listening':
      status = t(active === 'b' ? 'talk.person.bridge.listeningOther' : 'talk.person.bridge.listeningYou')
      break
    case 'processing':
      status = t('talk.person.bridge.translating', { lang: inlineName(languages[otherSpeaker(active ?? 'a')]) })
      break
    case 'speaking':
      status = t('talk.person.bridge.playing', { lang: inlineName(snapshot.result?.to ?? languages[otherSpeaker(active ?? 'a')]) })
      break
    case 'error':
      status = t(`${errorI18nKey(snapshot.error?.code ?? 'unknown')}.title`)
      break
    case 'idle':
      status = t(resultSpeaker(snapshot) ? 'talk.person.bridge.yourTurn' : 'talk.person.bridge.placePhone')
      break
  }

  // A sits at the bottom: A → B flows up, B → A flows down.
  const Chevron = flowFrom === 'b' ? ChevronDown : ChevronUp
  const chevron = cn('shrink-0 text-primary transition-opacity duration-300', flowFrom ? 'animate-eh-shimmer opacity-100' : 'opacity-0')

  return (
    <div className={cn('grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5', short ? 'h-[140px]' : 'h-[170px]')}>
      <div className="flex flex-col items-end gap-1.5 justify-self-end">
        <span className="rounded-full border border-solid border-border bg-surface px-[9px] py-[5px] font-mono text-xs font-medium whitespace-nowrap text-text2">
          <span aria-hidden="true">
            {getLanguage(languages.a).short} ⇄ {getLanguage(languages.b).short}
          </span>
          <span className="sr-only">{t('talk.person.pair', { a: inlineName(languages.a), b: inlineName(languages.b) })}</span>
        </span>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Chevron size={18} aria-hidden="true" className={chevron} />
        <ConversationSphere variant="anel" state={state} size={short ? 88 : 104} />
        <Chevron size={18} aria-hidden="true" className={chevron} style={flowFrom ? { animationDelay: '.2s' } : undefined} />
      </div>
      <p
        role="status"
        className={cn('m-0 justify-self-start text-[13px] leading-[1.35] font-semibold text-pretty break-words', state === 'error' ? 'text-danger' : 'text-text2')}
      >
        {status}
      </p>
    </div>
  )
}
