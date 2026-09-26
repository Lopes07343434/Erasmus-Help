import { useState } from 'react'
import { CircleAlert, Keyboard, Mic, MicOff, RotateCcw, Sparkles } from 'lucide-react'
import { ConversationSphere } from '@/components/sphere'
import { errorI18nKey } from '@/components/feedback'
import { cn, IconButton, useToast } from '@/components/ui'
import type { PracticeConversation, PracticeHistoryItem } from '@/hooks/usePracticeConversation'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguageCode } from '@/i18n/languages'
import type { PracticeScenario } from '@/services/ai'
import { ScenarioSheet } from './ScenarioSheet'
import { useInlineLanguageName, useShortViewport } from './talkHooks'
import { useTalkStore } from './talkStore'

interface TrainModeProps {
  practice: PracticeConversation
  /** Language being practised (the app speaks it). */
  language: LanguageCode
  /** The user's own language (translations under the app's messages). */
  nativeLanguage: LanguageCode
}

const BUBBLE_OPACITY = [1, 0.7, 0.4] as const

function Bubble({ item, age, language, nativeLanguage }: { item: PracticeHistoryItem; age: number; language: LanguageCode; nativeLanguage: LanguageCode }) {
  const { t } = useI18n()
  const user = item.role === 'user'
  return (
    <div
      className={cn(
        'flex max-w-[84%] animate-eh-fade flex-col gap-[3px] rounded-tile border border-solid border-border px-3.5 py-2.5 backdrop-blur-[16px] transition-opacity duration-300',
        user ? 'self-end bg-primary text-white' : 'self-start bg-surface text-text',
      )}
      style={{ opacity: BUBBLE_OPACITY[age] ?? 0.4 }}
    >
      <span className="sr-only">{t(user ? 'talk.train.speakerYou' : 'talk.train.speakerApp')}: </span>
      <span lang={language} className="text-[15px] leading-[1.4] font-medium break-words">
        {item.text}
      </span>
      {!user && item.translation ? (
        <span lang={nativeLanguage} className="text-xs leading-[1.35] break-words text-text3">
          <span className="sr-only">{t('talk.train.translation')}: </span>
          {item.translation}
        </span>
      ) : null}
    </div>
  )
}

/** "Treinar com a app": the user practises speaking with the app, which plays a scenario role. */
export function TrainMode({ practice, language, nativeLanguage }: TrainModeProps) {
  const { t, languageName } = useI18n()
  const inlineName = useInlineLanguageName()
  const toast = useToast()
  const short = useShortViewport()
  const rememberScenario = useTalkStore((s) => s.setScenario)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { state, history, muted, scenario } = practice
  const waiting = state === 'idle' || state === 'error'
  const notStarted = history.length === 0

  // The opening line is fetched + spoken from a tap (iOS only allows speech started by a user gesture).
  const onSphere = () => {
    if (notStarted && waiting) return practice.start()
    if (muted && waiting) return toast.show(t('talk.train.toasts.muted'), { icon: MicOff })
    practice.tap()
  }

  const chooseScenario = (next: PracticeScenario) => {
    setSheetOpen(false)
    if (next === scenario && !notStarted) return
    rememberScenario(next)
    practice.setScenario(next)
    practice.start()
  }

  let status: string
  let hint: string
  if (state === 'error') {
    const key = errorI18nKey(practice.error?.code ?? 'unknown')
    status = t(`${key}.title`)
    hint = t(`${key}.body`)
  } else {
    const key = state === 'idle' && notStarted ? 'ready' : state
    status = t(`talk.train.states.${key}.status`)
    hint = t(`talk.train.states.${key}.hint`, { lang: inlineName(language) })
  }

  const sphereLabel = t(
    waiting && notStarted
      ? 'talk.train.sphere.start'
      : state === 'listening'
        ? 'talk.train.sphere.stop'
        : state === 'speaking'
          ? 'talk.train.sphere.interrupt'
          : state === 'processing'
            ? 'talk.train.sphere.wait'
            : 'talk.train.sphere.speak',
  )

  const recent = history.slice(-3)

  return (
    <div className="relative flex flex-1 animate-eh-fade flex-col">
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-base leading-[1.3] font-bold break-words">{t(`talk.train.scenarios.${scenario}.title`)}</h2>
          <p className="m-0 text-[13px] text-text3">{t('talk.train.subtitle', { lang: languageName(language) })}</p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={t('talk.train.scenarioAria')}
          aria-haspopup="dialog"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-solid border-border bg-surface px-3.5 text-[13px] font-semibold text-text backdrop-blur-[16px] transition-transform duration-150 active:scale-[.97]"
        >
          <Sparkles size={15} aria-hidden="true" className="text-primary" />
          {t('talk.train.scenario')}
        </button>
      </div>

      <div
        role="log"
        aria-label={t('talk.train.log')}
        className={cn('relative mt-3.5 flex flex-col justify-end gap-2.5', short ? 'min-h-24' : 'min-h-[150px]')}
      >
        {recent.map((item, i) => (
          <Bubble key={item.id} item={item} age={recent.length - 1 - i} language={language} nativeLanguage={nativeLanguage} />
        ))}
      </div>

      <div className={cn('relative flex flex-1 flex-col items-center justify-center', short ? 'gap-4 pt-3' : 'gap-[22px] pt-5')}>
        <button
          type="button"
          onClick={onSphere}
          aria-label={sphereLabel}
          aria-disabled={state === 'processing' || undefined}
          className="rounded-full border-0 bg-transparent p-0 transition-transform duration-200 active:scale-[.96]"
        >
          <ConversationSphere variant="vidro" state={state} size={short ? 160 : 196} />
        </button>
        <div role="status" className="flex min-h-10 flex-col items-center gap-1 text-center">
          <span className={cn('flex items-center gap-1.5 text-base font-semibold break-words', state === 'error' ? 'text-danger' : 'text-text')}>
            {state === 'error' ? <CircleAlert size={17} aria-hidden="true" className="shrink-0" /> : null}
            {status}
          </span>
          <span className="text-[13px] text-pretty text-text3">{hint}</span>
        </div>
      </div>

      <div className="relative flex justify-center gap-5 pt-2">
        <IconButton
          variant="glass"
          size="lg"
          icon={muted ? MicOff : Mic}
          aria-label={t('talk.train.controls.mute')}
          aria-pressed={muted}
          onClick={practice.toggleMute}
        />
        <IconButton
          variant="glass"
          size="lg"
          icon={Keyboard}
          aria-label={t('talk.train.controls.keyboard')}
          onClick={() => toast.show(t('talk.train.toasts.keyboard'), { icon: Keyboard })}
        />
        <IconButton variant="glass" size="lg" icon={RotateCcw} aria-label={t('talk.train.controls.reset')} onClick={practice.start} />
      </div>

      <ScenarioSheet open={sheetOpen} value={scenario} onClose={() => setSheetOpen(false)} onSelect={chooseScenario} />
    </div>
  )
}
