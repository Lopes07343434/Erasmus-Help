import { useId } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguageCode } from '@/i18n/languages'
import type { VoiceTranslationResult } from '@/hooks/useVoiceTranslation'
import { GlassCard, Waveform, cn } from '@/components/ui'
import type { TranslatorView } from './translatorView'

interface RecognizedCardProps {
  view: TranslatorView
  /** Language of the text shown (the result's source when a result is shown, else the selected source). */
  language: LanguageCode
  /** Live transcript while listening; the final transcript while processing/translating or after a failure. */
  transcript: string
  result: VoiceTranslationResult | null
}

const textClass = 'm-0 text-[17px] leading-[1.45] text-pretty break-words'

/**
 * "Reconhecido · {lang}" card (no shadow, min-h 96). After recognition it shows the corrected text when there is
 * one, and always keeps what was actually heard visible ("Original: …").
 */
export function RecognizedCard({ view, language, transcript, result }: RecognizedCardProps) {
  const { t, languageName } = useI18n()
  const labelId = useId()

  let body
  if (view === 'listening') {
    body = (
      <>
        <div className="flex items-center gap-3">
          <Waveform />
          <span className="text-sm text-text2">{t('translate.recognized.listening')}</span>
        </div>
        {transcript ? (
          <p lang={language} translate="no" className={cn(textClass, 'text-text2')}>
            {transcript}
          </p>
        ) : null}
      </>
    )
  } else if (view === 'done' && result) {
    body = (
      <>
        <p lang={result.from} translate="no" className={cn(textClass, 'animate-eh-fade text-text')}>
          {result.corrected ?? result.original}
        </p>
        {result.corrected ? (
          <p lang={result.from} translate="no" className="m-0 text-[13px] leading-[1.4] break-words text-text3">
            {t('translate.recognized.original', { text: result.original })}
          </p>
        ) : null}
      </>
    )
  } else if (transcript && view !== 'idle') {
    // processing (shimmer while the text is checked) · translating · error after recognition
    body = (
      <p
        lang={language}
        translate="no"
        className={cn(textClass, 'text-text', view === 'processing' ? 'animate-[ehShimmer_1s_ease-in-out_infinite]' : 'animate-eh-fade')}
      >
        {transcript}
      </p>
    )
  } else {
    body = <p className="m-0 text-base leading-[1.45] text-text3">{t(`translate.recognized.hint.${language}`)}</p>
  }

  return (
    <GlassCard as="section" shadow={false} aria-labelledby={labelId} className="flex min-h-24 flex-col gap-2.5">
      <h2 id={labelId} className="m-0 text-xs font-semibold tracking-[.04em] text-text3 uppercase">
        {t('translate.recognized.label', { language: languageName(language) })}
      </h2>
      {body}
    </GlassCard>
  )
}
