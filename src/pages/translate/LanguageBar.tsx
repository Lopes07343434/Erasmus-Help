import { ArrowLeftRight, ChevronDown } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { getLanguage, type LanguageCode } from '@/i18n/languages'
import { LangBadge } from '@/components/ui'
import type { LanguagePair, PairSide } from './languagePair'

interface LanguageBarProps {
  pair: LanguagePair
  onOpen: (side: PairSide) => void
  onSwap: () => void
}

/**
 * Glass bar (p-6, radius 18): source · swap · target, as in the design's translator header.
 * The longest names ("Portugalski", "Portuguese") don't fit next to badge + chevron on phones, so the bar is a
 * size container: below 368px the chevron goes, below 300px the badge sits above the name. Names never truncate
 * in the three UI languages from 320px up.
 */
export function LanguageBar({ pair, onOpen, onSwap }: LanguageBarProps) {
  const { t } = useI18n()
  return (
    <div className="glass flex items-center gap-2 rounded-[18px] p-1.5 shadow-glass @container">
      <LanguageButton code={pair.from} side="from" onOpen={onOpen} />
      <button
        type="button"
        aria-label={t('translate.languages.swap')}
        onClick={onSwap}
        className="grid size-11 shrink-0 place-items-center rounded-full border border-solid border-border bg-surface-solid text-primary transition-transform duration-250 active:rotate-180"
      >
        <ArrowLeftRight size={17} aria-hidden="true" />
      </button>
      <LanguageButton code={pair.to} side="to" onOpen={onOpen} />
    </div>
  )
}

interface LanguageButtonProps {
  code: LanguageCode
  side: PairSide
  onOpen: (side: PairSide) => void
}

function LanguageButton({ code, side, onOpen }: LanguageButtonProps) {
  const { t, languageName } = useI18n()
  const name = languageName(code)
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t(side === 'from' ? 'translate.languages.sourceButton' : 'translate.languages.targetButton', { language: name })}
      onClick={() => onOpen(side)}
      className="flex h-12 min-w-0 flex-1 items-center gap-1.5 rounded-chip border-0 bg-transparent px-2 text-left text-text transition-colors duration-150 hover:bg-primary-soft @max-[300px]:flex-col @max-[300px]:items-start @max-[300px]:justify-center @max-[300px]:gap-0.5"
    >
      <LangBadge code={getLanguage(code).short} decorative />
      <span className="max-w-full min-w-0 truncate text-[15px] leading-[1.35] font-semibold">{name}</span>
      <ChevronDown size={14} aria-hidden="true" className="ml-auto shrink-0 text-text3 @max-[368px]:hidden" />
    </button>
  )
}
