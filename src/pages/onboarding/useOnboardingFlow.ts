import { useCallback, useReducer } from 'react'
import { useNavigate } from 'react-router'
import { ROUTES } from '@/app/router'
import type { UiLocale } from '@/i18n/languages'
import type { NotificationPermissionState } from '@/services/notifications'
import { useSettingsStore } from '@/stores/settingsStore'
import type { CityLocation, UserRole } from '@/types/profile'
import {
  INTRO_SLIDES,
  currentSlide,
  currentStep,
  initialOnboardingState,
  isStepValid,
  onboardingReducer,
} from './onboardingModel'
import { persistOnboarding } from './persistOnboarding'

/**
 * Orchestrates the onboarding screens. `introOnly` replays the three intro slides (from Settings → Sobre)
 * and returns home, without splash or setup questions.
 */
export function useOnboardingFlow(introOnly: boolean) {
  const [state, dispatch] = useReducer(onboardingReducer, !introOnly, initialOnboardingState)
  const navigate = useNavigate()
  const setAppLanguage = useSettingsStore((s) => s.setAppLanguage)

  const goHome = useCallback(() => {
    void navigate(ROUTES.home, { replace: true })
  }, [navigate])

  const step = currentStep(state)
  const lastSlide = state.introIndex >= INTRO_SLIDES.length - 1

  return {
    state,
    step,
    slide: currentSlide(state),
    canContinue: isStepValid(step, state.answers),
    endSplash: () => dispatch({ type: 'endSplash' }),
    nextIntro: () => (introOnly && lastSlide ? goHome() : dispatch({ type: 'nextIntro' })),
    skipIntro: () => (introOnly ? goHome() : dispatch({ type: 'skipIntro' })),
    next: () => dispatch({ type: 'next' }),
    back: () => dispatch({ type: 'back' }),
    setName: (name: string) => dispatch({ type: 'setName', name }),
    setRole: (role: UserRole) => dispatch({ type: 'setRole', role }),
    /** The language question also switches the whole UI right away. */
    chooseLanguage: (language: UiLocale) => {
      dispatch({ type: 'setLanguage', language })
      setAppLanguage(language)
    },
    setCountry: (countryCode: string) => dispatch({ type: 'setCountry', countryCode }),
    setCity: (city: CityLocation | null) => dispatch({ type: 'setCity', city }),
    finish: (permission: NotificationPermissionState) => {
      if (persistOnboarding(state.answers, permission)) goHome()
    },
  }
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>
