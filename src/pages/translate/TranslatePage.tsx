import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguageCode } from '@/i18n/languages'
import { useVoiceTranslation } from '@/hooks/useVoiceTranslation'
import type { AppError, AppErrorCode } from '@/services/errors'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { PageHeader, useToast } from '@/components/ui'
import { LanguageBar } from './LanguageBar'
import { LanguageSheet } from './LanguageSheet'
import { MicButton } from './MicButton'
import { RecognizedCard } from './RecognizedCard'
import { ResultCard } from './ResultCard'
import { StepsRow } from './StepsRow'
import { chooseLanguage, defaultPair, swapPair, useLanguagePairStore, type LanguagePair, type PairSide } from './languagePair'
import { isCapturing, toView } from './translatorView'
import { useMicPermission } from './useMicPermission'

const ERROR_TOAST_MS = 3500

/**
 * Tradutor: pick a language pair, tap the mic, speak; the recognized text is (optionally) corrected and
 * translated by useVoiceTranslation. The page only orchestrates: no provider calls here.
 */
export default function TranslatePage() {
  const { t } = useI18n()
  const toast = useToast()
  const vt = useVoiceTranslation()
  const { phase, partialTranscript, result, error, speaking, speechError, isSupported, canSpeak, start, stop, cancel, speak, stopSpeaking } = vt

  // Language pair: follows profile/settings until the user changes it (then kept for the session).
  const myLanguage = useProfileStore((s) => s.myLanguage)
  const conversationLanguage = useSettingsStore((s) => s.conversationLanguage)
  const storedPair = useLanguagePairStore((s) => s.pair)
  const setPair = useLanguagePairStore((s) => s.setPair)
  const pair = storedPair ?? defaultPair(myLanguage, conversationLanguage)
  const [sheetSide, setSheetSide] = useState<PairSide | null>(null)

  const view = toView(phase, result !== null)
  const permission = useMicPermission(phase)

  // Leaving the page mid-capture (or while speaking) aborts everything.
  useEffect(() => cancel, [cancel])

  // TTS failures don't change the phase: tell the user once per failure.
  const lastSpeechError = useRef<AppError | null>(null)
  useEffect(() => {
    if (!speechError || speechError === lastSpeechError.current) return
    lastSpeechError.current = speechError
    toast.show(t(speechError.code === 'not-supported' ? 'translate.toast.speechUnsupported' : 'translate.toast.speechFailed'), {
      icon: CircleAlert,
      duration: ERROR_TOAST_MS,
    })
  }, [speechError, toast, t])

  const changePair = (next: LanguagePair) => {
    if (next.from === pair.from && next.to === pair.to) return
    // A capture in progress (or its error) belongs to the old pair; a finished result stays visible.
    if (isCapturing(phase) || phase === 'error') cancel()
    setPair(next)
  }

  const onMic = () => {
    if (phase === 'listening') stop()
    else if (!isCapturing(phase)) start({ from: pair.from, to: pair.to })
  }

  const onCopy = async () => {
    if (!result) return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(result.translation)
      toast.show(t('translate.toast.copied'))
    } catch {
      toast.show(t('translate.toast.copyFailed'), { icon: CircleAlert, duration: ERROR_TOAST_MS })
    }
  }

  // Before any attempt, explain problems we already know about (instead of letting the first tap fail).
  const proactiveError: AppErrorCode | null = view !== 'idle' ? null : !isSupported ? 'not-supported' : permission === 'denied' ? 'permission-denied' : null
  const errorCode = phase === 'error' ? (error?.code ?? 'unknown') : proactiveError

  const showingResult = view === 'done' && result !== null
  const recognizedLanguage: LanguageCode = showingResult ? result.from : pair.from
  const resultLanguage: LanguageCode = showingResult ? result.to : pair.to

  return (
    <div className="flex min-h-[calc(100dvh-var(--eh-content-pt)-var(--eh-content-pb))] flex-col gap-3.5">
      <PageHeader title={t('translate.title')} subtitle={t('translate.subtitle')} />
      <LanguageBar pair={pair} onOpen={setSheetSide} onSwap={() => changePair(swapPair(pair))} />
      <RecognizedCard view={view} language={recognizedLanguage} transcript={partialTranscript} result={result} />
      <ResultCard
        view={view}
        language={resultLanguage}
        result={result}
        errorCode={errorCode}
        speaking={speaking}
        canSpeak={canSpeak}
        onListen={() => (speaking ? stopSpeaking() : speak())}
        onCopy={() => void onCopy()}
      />
      <StepsRow view={view} />
      <MicButton view={view} onPress={onMic} />
      <LanguageSheet
        side={sheetSide}
        pair={pair}
        onClose={() => setSheetSide(null)}
        onSelect={(side, code: LanguageCode) => {
          setSheetSide(null)
          changePair(chooseLanguage(pair, side, code))
        }}
      />
    </div>
  )
}
