import { Check, Volume2 } from 'lucide-react'
import { BrandMark } from '@/components/brand'
import { ConversationSphere } from '@/components/sphere'
import { GlassCard, StatusPill } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { IntroSlide } from '../onboardingModel'
import { MARK_HALO, markHeightForWidth } from './brandSize'

/** Illustrations of the three intro slides (decorative: the heading and body carry the message). */
export function IntroVisual({ slide }: { slide: IntroSlide }) {
  if (slide === 'welcome') return <WelcomeTile />
  if (slide === 'translate') return <TranslationExample />
  return <ConversationSphere variant="vidro" state="speaking" size={170} />
}

function WelcomeTile() {
  return (
    <div aria-hidden="true" className="relative grid size-[176px] place-items-center">
      <div className="absolute -inset-[70px] rounded-full" style={{ background: MARK_HALO }} />
      <div className="absolute inset-0 rounded-[44px] border border-solid border-border bg-surface shadow-glass backdrop-blur-[18px]" />
      <BrandMark size={markHeightForWidth(92)} className="relative" />
    </div>
  )
}

/** Illustrative "recognised → translation" card from slide 2 (labels localized, target phrase in Italian). */
function TranslationExample() {
  const { t, locale, languageName } = useI18n()
  return (
    <GlassCard aria-hidden="true" padding="none" className="flex w-full flex-col gap-3.5 p-[18px]">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-[.04em] text-text3 uppercase">
          {t('onboarding.intro.example.recognized', { language: languageName(locale) })}
        </span>
        <span className="text-base leading-[1.4]">{t('onboarding.intro.example.source')}</span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-[.04em] text-primary uppercase">
          {t('onboarding.intro.example.translation', { language: languageName('it') })}
        </span>
        <span lang="it" className="text-xl leading-[1.35] font-semibold">
          {t('onboarding.intro.example.target')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="success" icon={Check}>
          {t('onboarding.intro.example.corrected')}
        </StatusPill>
        <StatusPill tone="primary" icon={Volume2}>
          {t('common.actions.listen')}
        </StatusPill>
      </div>
    </GlassCard>
  )
}
