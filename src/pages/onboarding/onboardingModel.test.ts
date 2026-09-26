import { describe, expect, it } from 'vitest'
import { initialOnboardingState, isStepValid, onboardingReducer, type OnboardingState } from './onboardingModel'
import { defaultConversationLanguage } from './persistOnboarding'

const atSetup = (): OnboardingState => ({ ...initialOnboardingState(false), phase: 'setup' })

describe('onboardingReducer', () => {
  it('goes splash → intro → setup, and skip jumps straight to the first question', () => {
    let s = initialOnboardingState(true)
    expect(s.phase).toBe('splash')
    s = onboardingReducer(s, { type: 'endSplash' })
    expect(s).toMatchObject({ phase: 'intro', introIndex: 0 })
    s = onboardingReducer(s, { type: 'nextIntro' })
    s = onboardingReducer(s, { type: 'nextIntro' })
    expect(s.introIndex).toBe(2)
    s = onboardingReducer(s, { type: 'nextIntro' })
    expect(s).toMatchObject({ phase: 'setup', stepIndex: 0 })
    expect(onboardingReducer(initialOnboardingState(false), { type: 'skipIntro' }).phase).toBe('setup')
  })

  it('does not advance past an invalid answer', () => {
    let s = atSetup()
    s = onboardingReducer(s, { type: 'next' })
    expect(s.stepIndex).toBe(0)
    s = onboardingReducer(s, { type: 'setName', name: '1234' })
    expect(onboardingReducer(s, { type: 'next' }).stepIndex).toBe(0)
    s = onboardingReducer(s, { type: 'setName', name: 'Zoë O’Neill' })
    s = onboardingReducer(s, { type: 'next' })
    expect(s.stepIndex).toBe(1)
    s = onboardingReducer(s, { type: 'back' })
    expect(s.stepIndex).toBe(0)
  })

  it('clears the city when the country changes', () => {
    let s = atSetup()
    s = onboardingReducer(s, { type: 'setCountry', countryCode: 'IT' })
    s = onboardingReducer(s, { type: 'setCity', city: { name: 'Milano', latitude: 45.46, longitude: 9.19 } })
    expect(isStepValid('location', s.answers)).toBe(true)
    s = onboardingReducer(s, { type: 'setCountry', countryCode: 'IT' })
    expect(s.answers.city).not.toBeNull()
    s = onboardingReducer(s, { type: 'setCountry', countryCode: 'PL' })
    expect(s.answers.city).toBeNull()
    expect(isStepValid('location', s.answers)).toBe(false)
  })

  it('treats notifications as optional', () => {
    expect(isStepValid('notifications', atSetup().answers)).toBe(true)
  })
})

describe('defaultConversationLanguage', () => {
  it('uses the local language when known and different from mine', () => {
    expect(defaultConversationLanguage('pt-PT', 'IT')).toBe('it')
    expect(defaultConversationLanguage('pl', 'DE')).toBe('de')
  })

  it('falls back to English, or Portuguese for English speakers', () => {
    expect(defaultConversationLanguage('pt-PT', 'PT')).toBe('en')
    expect(defaultConversationLanguage('pl', 'BE')).toBe('en')
    expect(defaultConversationLanguage('en', 'IE')).toBe('pt-PT')
    expect(defaultConversationLanguage('en', 'NL')).toBe('pt-PT')
  })
})
