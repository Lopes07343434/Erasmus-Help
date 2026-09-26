import { useId, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import { useNotificationPermission } from '@/pwa/useNotificationPermission'
import { SETUP_STEPS } from '../onboardingModel'
import { useFocusOnChange } from '../useFocusOnChange'
import type { OnboardingFlow } from '../useOnboardingFlow'
import { CitySearchField } from './CitySearchField'
import { CountryField } from './CountryField'
import { LanguageOptions } from './LanguageOptions'
import { NameField } from './NameField'
import { NotificationsStep } from './NotificationsStep'
import { OnboardingFrame } from './OnboardingFrame'
import { RoleOptions } from './RoleOptions'

/** The five setup questions: name → role → language → location → notifications. */
export function SetupScreen({ flow }: { flow: OnboardingFlow }) {
  const { t } = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const notifications = useNotificationPermission()
  const { platform, isStandalone } = useInstallPrompt()
  const [nameTouched, setNameTouched] = useState(false)
  const [notificationsAsked, setNotificationsAsked] = useState(false)

  const { step, state, canContinue } = flow
  const { answers, stepIndex } = state
  const total = SETUP_STEPS.length
  const isLast = stepIndex === total - 1
  // The name step autofocuses its input instead of the heading.
  useFocusOnChange(headingRef, stepIndex, step !== 'name')

  const notificationsDecided = (notificationsAsked && !notifications.requesting) || notifications.permission !== 'default'

  const advance = () => {
    if (!canContinue) {
      if (step === 'name') setNameTouched(true)
      return
    }
    if (isLast) flow.finish(notifications.permission)
    else flow.next()
  }

  const allowNotifications = () => {
    setNotificationsAsked(true)
    // Called straight from the click so the browser shows its real permission prompt.
    void notifications.request()
  }

  let content = null
  switch (step) {
    case 'name':
      content = (
        <NameField
          value={answers.name}
          onChange={(name) => {
            setNameTouched(true)
            flow.setName(name)
          }}
          onSubmit={advance}
          showErrors={nameTouched}
          autoFocus
          hideLabel
        />
      )
      break
    case 'role':
      content = <RoleOptions value={answers.role} onChange={flow.setRole} aria-labelledby={titleId} />
      break
    case 'language':
      content = <LanguageOptions value={answers.language} onChange={flow.chooseLanguage} aria-labelledby={titleId} />
      break
    case 'location':
      content = (
        <div className="flex flex-col gap-4">
          <CountryField value={answers.countryCode} onChange={flow.setCountry} />
          <CitySearchField key={answers.countryCode ?? 'none'} countryCode={answers.countryCode} value={answers.city} onChange={flow.setCity} />
        </div>
      )
      break
    case 'notifications':
      content = (
        <NotificationsStep
          permission={notifications.permission}
          requesting={notifications.requesting}
          decided={notificationsDecided}
          platform={platform}
          isStandalone={isStandalone}
          onAllow={allowNotifications}
          onDecline={() => flow.finish(notifications.permission)}
        />
      )
      break
  }

  const showCta = step !== 'notifications' || notificationsDecided

  return (
    <OnboardingFrame
      headerAction={
        stepIndex > 0 ? (
          <IconButton variant="plain" icon={ChevronLeft} iconSize={22} aria-label={t('common.actions.back')} onClick={flow.back} className="-mr-2.5" />
        ) : null
      }
      title={t(`onboarding.${step}.title`)}
      titleId={titleId}
      body={t(`onboarding.${step}.body`)}
      headingRef={headingRef}
      contentKey={step}
      progress={{ index: stepIndex, total, label: t('onboarding.progress', { current: stepIndex + 1, total }) }}
      cta={
        showCta ? (
          <Button trailingIcon={ArrowRight} disabled={!canContinue} onClick={advance}>
            {isLast ? t('common.actions.start') : t('common.actions.continue')}
          </Button>
        ) : null
      }
    >
      {content}
    </OnboardingFrame>
  )
}
