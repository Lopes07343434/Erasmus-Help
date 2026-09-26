import { useI18n } from '@/i18n/I18nProvider'
import { LANGUAGES, type LanguageCode } from '@/i18n/languages'
import { OptionList, Sheet } from '@/components/ui'
import type { LanguagePair, PairSide } from './languagePair'

interface LanguageSheetProps {
  /** Side being edited; null = closed. */
  side: PairSide | null
  pair: LanguagePair
  onSelect: (side: PairSide, code: LanguageCode) => void
  onClose: () => void
}

/** "Idioma de origem" / "Idioma de destino" picker: every registry language, the current one selected. */
export function LanguageSheet({ side, pair, onSelect, onClose }: LanguageSheetProps) {
  const { t, languageName } = useI18n()
  const title = side === 'to' ? t('translate.languages.target') : t('translate.languages.source')
  return (
    <Sheet open={side !== null} onClose={onClose} title={title}>
      <OptionList<LanguageCode>
        aria-label={title}
        value={side ? pair[side] : null}
        onChange={(code) => {
          if (side) onSelect(side, code)
        }}
        options={LANGUAGES.map((l) => ({ value: l.code, label: languageName(l.code), badge: l.short }))}
      />
    </Sheet>
  )
}
