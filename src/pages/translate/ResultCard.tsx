import { useId } from 'react'
import { Check, CircleAlert, Copy, MicOff, Square, Volume2, WifiOff, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguageCode } from '@/i18n/languages'
import type { VoiceTranslationResult } from '@/hooks/useVoiceTranslation'
import type { AppErrorCode } from '@/services/errors'
import { Button, GlassCard, IconButton, IconTile, Skeleton, StatusPill } from '@/components/ui'
import { errorI18nKey } from '@/components/feedback'
import { ERROR_HINTS, displayErrorCode, formatCorrectionList, type TranslatorView } from './translatorView'

interface ResultCardProps {
  view: TranslatorView
  /** Language of the translation (the result's target when a result is shown, else the selected target). */
  language: LanguageCode
  result: VoiceTranslationResult | null
  /** Error to explain in place of the translation (phase error, or a proactive microphone/support problem). */
  errorCode: AppErrorCode | null
  speaking: boolean
  canSpeak: boolean
  onListen: () => void
  onCopy: () => void
}

/**
 * "Tradução · {lang}" card (min-h 150; border turns primary when done). The text part is a polite live region,
 * so the translation or the error is announced once; the actions stay outside it.
 */
export function ResultCard({ view, language, result, errorCode, speaking, canSpeak, onListen, onCopy }: ResultCardProps) {
  const { t, languageName, locale } = useI18n()
  const labelId = useId()
  const captionId = useId()
  const done = view === 'done' && result !== null

  let body = null
  if (errorCode) {
    body = <ErrorNotice code={errorCode} />
  } else if (done) {
    body = (
      <>
        <p lang={result.to} translate="no" className="m-0 animate-eh-fade text-[22px] leading-[1.35] font-semibold tracking-[-.01em] text-pretty break-words">
          {result.translation}
        </p>
        {result.corrections.length > 0 ? (
          <StatusPill tone="success" icon={Check} className="self-start">
            {t('translate.result.corrected', {
              changes: formatCorrectionList(result.corrections, locale, (kind) => t(`translate.corrections.${kind}`)),
            })}
          </StatusPill>
        ) : null}
      </>
    )
  } else if (view === 'translating') {
    body = (
      <div className="flex flex-col gap-2.5 pt-1">
        <Skeleton width="92%" />
        <Skeleton width="64%" delay={0.15} />
      </div>
    )
  } else {
    body = <p className="m-0 text-base leading-[1.45] text-text3">{t('translate.result.empty')}</p>
  }

  return (
    <GlassCard
      as="section"
      aria-labelledby={labelId}
      className="flex min-h-[150px] flex-col"
      style={{ borderColor: done && !errorCode ? 'var(--primary)' : undefined, transition: 'border-color .3s' }}
    >
      <h2 id={labelId} className="m-0 text-xs font-semibold tracking-[.04em] text-primary uppercase">
        {t('translate.result.label', { language: languageName(language) })}
      </h2>
      <div role="status" aria-live="polite" aria-busy={view === 'translating' || undefined} className="mt-3 flex flex-col gap-3">
        {body}
      </div>
      {done && !errorCode ? (
        <>
          <div className="mt-3.5 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={speaking ? Square : Volume2}
              aria-pressed={speaking}
              disabled={!canSpeak}
              aria-describedby={canSpeak ? undefined : captionId}
              onClick={onListen}
              className="flex-1"
            >
              {speaking ? t('translate.result.playing') : t('translate.result.listen')}
            </Button>
            <IconButton variant="outline" shape="rounded" icon={Copy} iconSize={18} aria-label={t('translate.result.copy')} onClick={onCopy} />
          </div>
          {canSpeak ? null : (
            <p id={captionId} className="m-0 mt-2 text-[13px] text-text3">
              {t('translate.result.speechUnavailable')}
            </p>
          )}
        </>
      ) : null}
    </GlassCard>
  )
}

const ERROR_ICONS: Partial<Record<AppErrorCode, LucideIcon>> = {
  'permission-denied': MicOff,
  'not-supported': MicOff,
  offline: WifiOff,
}

/** Compact, left-aligned error for inside the card: errors.<key>.title + translator context (or errors.<key>.body). */
function ErrorNotice({ code: rawCode }: { code: AppErrorCode }) {
  const { t } = useI18n()
  const code = displayErrorCode(rawCode)
  const key = errorI18nKey(code)
  const hint = ERROR_HINTS[code]
  return (
    <div className="flex items-start gap-3">
      <IconTile icon={ERROR_ICONS[code] ?? CircleAlert} tone="danger" />
      <div className="flex min-w-0 flex-col gap-1 pt-0.5">
        <p className="m-0 text-base font-semibold text-text">{t(`${key}.title`)}</p>
        <p className="m-0 text-sm leading-[1.45] text-pretty text-text3">{hint ? t(hint) : t(`${key}.body`)}</p>
      </div>
    </div>
  )
}
