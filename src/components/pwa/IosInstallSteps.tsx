import { Compass, Share, SquarePlus, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

const STEPS: readonly { readonly key: 'step1' | 'step2' | 'step3'; readonly icon: LucideIcon }[] = [
  { key: 'step1', icon: Compass },
  { key: 'step2', icon: Share },
  { key: 'step3', icon: SquarePlus },
]

/** The three manual "Add to Home Screen" steps for iOS (Safari has no install prompt). */
export function IosInstallSteps() {
  const { t } = useI18n()
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0 pb-1">
      {STEPS.map(({ key, icon: Icon }, i) => (
        <li key={key} className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-bold text-primary">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 pt-[3px] text-[15px] leading-[1.45] text-text">{t(`pwa.install.steps.ios.${key}`)}</span>
          <Icon size={20} aria-hidden="true" className="mt-[5px] shrink-0 text-primary" />
        </li>
      ))}
    </ol>
  )
}
