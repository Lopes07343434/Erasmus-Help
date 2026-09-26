import { Coffee, GraduationCap, House, type LucideIcon } from 'lucide-react'
import { IconTile, OptionList, Sheet, type OptionItem } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { PRACTICE_SCENARIOS, type PracticeScenario } from '@/services/ai'

const ICONS: Record<PracticeScenario, LucideIcon> = { cafe: Coffee, landlord: House, office: GraduationCap }

interface ScenarioSheetProps {
  open: boolean
  value: PracticeScenario
  onClose: () => void
  onSelect: (scenario: PracticeScenario) => void
}

/** "Treinar com a app": practice scenario picker (café, landlord, university office). */
export function ScenarioSheet({ open, value, onClose, onSelect }: ScenarioSheetProps) {
  const { t } = useI18n()
  const title = t('talk.train.scenarioSheet')
  const options: OptionItem<PracticeScenario>[] = PRACTICE_SCENARIOS.map((s) => ({
    value: s,
    label: t(`talk.train.scenarios.${s}.name`),
    description: t(`talk.train.scenarios.${s}.description`),
    leading: <IconTile icon={ICONS[s]} />,
  }))

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <OptionList<PracticeScenario> aria-label={title} options={options} value={value} onChange={onSelect} />
    </Sheet>
  )
}
