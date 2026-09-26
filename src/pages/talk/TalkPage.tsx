import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Sparkles, UsersRound, VolumeX } from 'lucide-react'
import { SegmentedControl, useToast } from '@/components/ui'
import { usePracticeConversation } from '@/hooks/usePracticeConversation'
import { useI18n } from '@/i18n/I18nProvider'
import { useProfileStore } from '@/stores/profileStore'
import type { AppError } from '@/services/errors'
import { useSettingsStore } from '@/stores/settingsStore'
import { PersonMode } from './PersonMode'
import { TrainMode } from './TrainMode'
import { useInlineLanguageName } from './talkHooks'
import { parseTalkMode, useTalkStore, type TalkMode } from './talkStore'
import { usePersonConversation } from './usePersonConversation'

const TABS_ID = 'talk-mode'
const panelId = (mode: TalkMode) => `talk-panel-${mode}`

/**
 * Conversar (/talk?mode=person|train). Both conversations live here so a mode switch can halt the other one
 * (and the train opening line can start inside the tab tap); leaving the page disposes both hooks.
 */
export default function TalkPage() {
  const { t } = useI18n()
  const toast = useToast()
  const inlineName = useInlineLanguageName()
  const [params, setParams] = useSearchParams()
  const mode = parseTalkMode(params.get('mode'))

  const myLanguage = useProfileStore((s) => s.myLanguage)
  const userName = useProfileStore((s) => s.name)
  const conversationLanguage = useSettingsStore((s) => s.conversationLanguage)
  const initialScenario = useTalkStore((s) => s.scenario)
  const nativeLanguage = myLanguage ?? 'pt-PT'

  const person = usePersonConversation()
  const practice = usePracticeConversation({ language: conversationLanguage, nativeLanguage, userName: userName || undefined, initialScenario })

  // Whatever changed the mode (tabs, a link, the nav), stop the mode we left.
  const { cancel: cancelPerson, speechError } = person
  const { reset: resetPractice } = practice
  const previousMode = useRef(mode)
  useEffect(() => {
    if (previousMode.current === mode) return
    if (previousMode.current === 'person') cancelPerson()
    else resetPractice()
    previousMode.current = mode
  }, [mode, cancelPerson, resetPractice])

  // No voice for the translation's language: say so once per failure; the text stays in the panel.
  const speechLanguage = person.snapshot.result?.to
  const announcedSpeechError = useRef<AppError | null>(null)
  useEffect(() => {
    if (!speechError || !speechLanguage || speechError === announcedSpeechError.current) return
    announcedSpeechError.current = speechError
    toast.show(t('talk.person.speechUnavailable', { lang: inlineName(speechLanguage) }), { icon: VolumeX, duration: 3200 })
  }, [speechError, speechLanguage, toast, t, inlineName])

  const selectMode = (next: TalkMode) => {
    if (next === mode) return
    // Inside the tap: iOS only lets the app speak (the opening line) after a user gesture.
    if (next === 'train') practice.start()
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('mode', next)
        return p
      },
      { replace: true },
    )
  }

  return (
    <div className="relative -mx-1 flex min-h-[calc(100dvh_-_var(--eh-content-pt)_-_var(--eh-content-pb))] flex-col gap-2.5 lg:mx-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--blob1)_0%,transparent_60%)]"
      />
      <h1 className="sr-only">{t('talk.title')}</h1>
      <SegmentedControl<TalkMode>
        id={TABS_ID}
        aria-label={t('talk.modes.label')}
        value={mode}
        onChange={selectMode}
        className="relative shrink-0"
        options={[
          { value: 'person', label: t('talk.modes.person'), icon: UsersRound, controls: mode === 'person' ? panelId('person') : undefined },
          { value: 'train', label: t('talk.modes.train'), icon: Sparkles, controls: mode === 'train' ? panelId('train') : undefined },
        ]}
      />
      <div role="tabpanel" id={panelId(mode)} aria-labelledby={`${TABS_ID}-tab-${mode}`} className="relative flex flex-1 flex-col">
        {mode === 'person' ? (
          <PersonMode conversation={person} />
        ) : (
          <TrainMode practice={practice} language={conversationLanguage} nativeLanguage={nativeLanguage} />
        )}
      </div>
    </div>
  )
}
