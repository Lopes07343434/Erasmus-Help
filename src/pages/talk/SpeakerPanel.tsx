import { ChevronDown, Mic, Square, UserRound, Volume2 } from 'lucide-react'
import { buttonClassName, cn, GlassCard, IconButton, LangBadge, Skeleton, Waveform } from '@/components/ui'
import { getLanguage, type LanguageCode } from '@/i18n/languages'
import { panelLanguageName, panelStrings, type PanelStrings } from '@/i18n/panel'
import type { PanelContent, PanelModel } from './personModel'
import type { Speaker } from './talkStore'

interface SpeakerPanelProps {
  side: Speaker
  /** The panel's language: everything inside is written in it (i18n/panel.ts). */
  language: LanguageCode
  model: PanelModel
  /** Accessible name of the panel, in the app language ("O teu lado"). */
  label: string
  /** Faces the person sitting opposite (person B): the phone lies flat on the table between them. */
  rotated?: boolean
  onTalk: () => void
  onReplay: () => void
  onChangeLanguage: () => void
}

const caption = 'text-xs leading-[1.3] font-semibold tracking-[.04em] uppercase break-words'

function PanelBody({ content, s }: { content: PanelContent; s: PanelStrings }) {
  switch (content.kind) {
    case 'hint':
      return <p className="m-0 text-[15px] leading-[1.45] text-pretty break-words text-text3">{s.hint}</p>
    case 'live':
      return (
        <>
          <div className="flex items-center gap-3">
            <Waveform />
            <span className="text-sm text-text2">{s.listening}</span>
          </div>
          {content.transcript ? <p className="m-0 line-clamp-3 text-[15px] leading-[1.4] break-words text-text2">{content.transcript}</p> : null}
        </>
      )
    case 'pending':
      return (
        <div aria-busy="true" className="flex flex-col gap-1.5">
          <span className={cn(caption, 'text-primary')}>{s.translating}</span>
          <Skeleton height={15} width="90%" />
          <Skeleton height={15} width="60%" delay={0.15} />
        </div>
      )
    case 'said':
      return (
        <>
          <span className={cn(caption, 'text-text3')}>{s.said}</span>
          <p key={content.text} className="m-0 animate-eh-fade text-base leading-[1.35] font-medium text-pretty break-words text-text2">
            {content.text}
          </p>
        </>
      )
    case 'received':
      return (
        <>
          <span className={cn(caption, 'text-primary')}>{s.translatedFrom[content.from]}</span>
          <p key={content.text} className="m-0 animate-eh-fade text-xl leading-[1.35] font-semibold text-pretty break-words text-text">
            {content.text}
          </p>
        </>
      )
  }
}

/**
 * One person's half of the table: header (avatar, "You" in the panel's language, language pill), content
 * (hint / listening / translating / said / received translation) and the Speak/Stop + replay buttons.
 * Person B's panel is rotated 180° so the person sitting opposite can read it.
 */
export function SpeakerPanel({ side, language, model, label, rotated, onTalk, onReplay, onChangeLanguage }: SpeakerPanelProps) {
  const s = panelStrings(language)
  const { content, live, blocked, hot, canReplay } = model

  return (
    <GlassCard
      as="section"
      padding="none"
      aria-label={label}
      style={hot ? { borderColor: 'var(--primary)' } : undefined}
      className={cn('flex flex-1 flex-col p-3.5 transition-[border-color] duration-300', rotated && 'rotate-180')}
    >
      <div lang={language} className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full',
              side === 'a' ? 'bg-primary-soft text-primary' : 'bg-[rgba(34,196,245,.16)] text-[#0B87B8] dark:text-accent',
            )}
          >
            <UserRound size={16} />
          </span>
          <span className="min-w-0 text-[15px] font-bold break-words">{s.you}</span>
          <button
            type="button"
            onClick={onChangeLanguage}
            aria-haspopup="dialog"
            className="relative ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-solid border-border bg-surface-solid pr-2.5 pl-1.5 text-[13px] font-semibold text-text transition-transform duration-150 after:absolute after:inset-x-0 after:-inset-y-1 active:scale-[.97]"
          >
            <LangBadge code={getLanguage(language).short} decorative />
            <span className="sr-only">{s.changeLanguage}: </span>
            {panelLanguageName(language)}
            <ChevronDown size={13} aria-hidden="true" className="text-text3" />
          </button>
        </div>

        <div className="flex min-h-12 flex-1 flex-col justify-center gap-1.5">
          <PanelBody content={content} s={s} />
        </div>

        <div className="flex gap-2">
          {canReplay ? (
            <IconButton variant="outline" shape="rounded" size="lg" aria-label={s.replay} onClick={onReplay}>
              <Volume2 size={19} aria-hidden="true" className="text-primary" />
            </IconButton>
          ) : null}
          <button
            type="button"
            onClick={onTalk}
            disabled={blocked}
            className={buttonClassName({ variant: 'primary', className: cn('min-w-0 flex-1 transition-opacity duration-200', blocked && 'opacity-45') })}
          >
            {live ? <Square size={18} aria-hidden="true" className="shrink-0" /> : <Mic size={18} aria-hidden="true" className="shrink-0" />}
            <span className="min-w-0 break-words">{live ? s.stop : s.speak}</span>
          </button>
        </div>
      </div>
    </GlassCard>
  )
}
