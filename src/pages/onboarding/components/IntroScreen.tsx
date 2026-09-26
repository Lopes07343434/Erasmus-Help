import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { INTRO_SLIDES } from '../onboardingModel'
import { useFocusOnChange } from '../useFocusOnChange'
import type { OnboardingFlow } from '../useOnboardingFlow'
import { IntroVisual } from './IntroVisual'
import { OnboardingFrame } from './OnboardingFrame'
import { SkipButton } from './SkipButton'

/** The three intro slides of the prototype (OB array). */
export function IntroScreen({ flow, introOnly }: { flow: OnboardingFlow; introOnly: boolean }) {
  const { t } = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { introIndex } = flow.state
  const slide = flow.slide
  const total = INTRO_SLIDES.length
  const last = introIndex === total - 1
  useFocusOnChange(headingRef, introIndex)

  return (
    <OnboardingFrame
      headerAction={
        last ? null : (
          <SkipButton onClick={flow.skipIntro} aria-label={t('onboarding.intro.skip')}>
            {t('common.actions.skip')}
          </SkipButton>
        )
      }
      visual={<IntroVisual slide={slide} />}
      visualKey={slide}
      title={t(`onboarding.intro.slides.${slide}.title`)}
      body={t(`onboarding.intro.slides.${slide}.body`)}
      headingRef={headingRef}
      progress={{ index: introIndex, total, label: t('onboarding.intro.progress', { current: introIndex + 1, total }) }}
      cta={
        <Button trailingIcon={ArrowRight} onClick={flow.nextIntro}>
          {introOnly && last ? t('common.actions.start') : t('common.actions.continue')}
        </Button>
      }
    />
  )
}
