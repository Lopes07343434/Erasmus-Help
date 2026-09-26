import type { UiLocale } from '@/i18n/languages'
import type { CityLocation, UserRole } from '@/types/profile'
import { validateName } from '@/utils/validation'

/**
 * Pure state machine of the onboarding flow: splash → intro slides → setup questions.
 * In-progress answers live here (component state) and are written to the stores only on finish,
 * except the app language, which the language step applies immediately (see useOnboardingFlow).
 */

export const INTRO_SLIDES = ['welcome', 'translate', 'practice'] as const
export type IntroSlide = (typeof INTRO_SLIDES)[number]

export const SETUP_STEPS = ['name', 'role', 'language', 'location', 'notifications'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export type OnboardingPhase = 'splash' | 'intro' | 'setup'

export interface OnboardingAnswers {
  name: string
  role: UserRole | null
  /** "Meu idioma" chosen in the language step (only UI locales are offered there). */
  language: UiLocale | null
  countryCode: string | null
  /** Picked from geocoding (with coordinates) or, when search is offline/unavailable, the typed name only. */
  city: CityLocation | null
}

export interface OnboardingState {
  phase: OnboardingPhase
  introIndex: number
  stepIndex: number
  answers: OnboardingAnswers
}

export type OnboardingAction =
  | { type: 'endSplash' }
  | { type: 'nextIntro' }
  | { type: 'skipIntro' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'setName'; name: string }
  | { type: 'setRole'; role: UserRole }
  | { type: 'setLanguage'; language: UiLocale }
  | { type: 'setCountry'; countryCode: string }
  | { type: 'setCity'; city: CityLocation | null }

export const EMPTY_ANSWERS: OnboardingAnswers = { name: '', role: null, language: null, countryCode: null, city: null }

export function initialOnboardingState(withSplash: boolean): OnboardingState {
  return { phase: withSplash ? 'splash' : 'intro', introIndex: 0, stepIndex: 0, answers: EMPTY_ANSWERS }
}

export function currentStep(state: OnboardingState): SetupStep {
  return SETUP_STEPS[state.stepIndex] ?? 'name'
}

export function currentSlide(state: OnboardingState): IntroSlide {
  return INTRO_SLIDES[state.introIndex] ?? 'welcome'
}

/** Whether the answer of `step` lets the user continue. Notifications are optional. */
export function isStepValid(step: SetupStep, answers: OnboardingAnswers): boolean {
  switch (step) {
    case 'name':
      return validateName(answers.name).ok
    case 'role':
      return answers.role !== null
    case 'language':
      return answers.language !== null
    case 'location':
      return answers.countryCode !== null && answers.city !== null
    case 'notifications':
      return true
  }
}

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'endSplash':
      return state.phase === 'splash' ? { ...state, phase: 'intro', introIndex: 0 } : state
    case 'nextIntro':
      if (state.phase !== 'intro') return state
      return state.introIndex < INTRO_SLIDES.length - 1
        ? { ...state, introIndex: state.introIndex + 1 }
        : { ...state, phase: 'setup', stepIndex: 0 }
    case 'skipIntro':
      return state.phase === 'intro' ? { ...state, phase: 'setup', stepIndex: 0 } : state
    case 'next': {
      if (state.phase !== 'setup') return state
      const step = currentStep(state)
      if (!isStepValid(step, state.answers) || state.stepIndex >= SETUP_STEPS.length - 1) return state
      return { ...state, stepIndex: state.stepIndex + 1 }
    }
    case 'back':
      return state.phase === 'setup' && state.stepIndex > 0 ? { ...state, stepIndex: state.stepIndex - 1 } : state
    case 'setName':
      return { ...state, answers: { ...state.answers, name: action.name } }
    case 'setRole':
      return { ...state, answers: { ...state.answers, role: action.role } }
    case 'setLanguage':
      return { ...state, answers: { ...state.answers, language: action.language } }
    case 'setCountry':
      if (action.countryCode === state.answers.countryCode) return state
      // A city belongs to one country: changing the country clears it.
      return { ...state, answers: { ...state.answers, countryCode: action.countryCode, city: null } }
    case 'setCity':
      return { ...state, answers: { ...state.answers, city: action.city } }
  }
}
