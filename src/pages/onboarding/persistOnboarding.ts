import type { LanguageCode } from '@/i18n/languages'
import { localLanguageOf } from '@/services/geo'
import { isPushConfigured, subscribeToPush, type NotificationPermissionState } from '@/services/notifications'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { OnboardingAnswers } from './onboardingModel'

/**
 * Default conversation language: the country's local language when we know it and it differs from
 * the user's own language; otherwise English (or Portuguese for English speakers).
 */
export function defaultConversationLanguage(myLanguage: LanguageCode, countryCode: string | null): LanguageCode {
  const local = countryCode ? localLanguageOf(countryCode) : undefined
  if (local && local !== myLanguage) return local
  return myLanguage === 'en' ? 'pt-PT' : 'en'
}

/**
 * Writes the finished onboarding to the stores. Returns false (and writes nothing) when an answer is
 * missing or rejected by the store validation, so the caller can stay on the flow.
 */
export function persistOnboarding(answers: OnboardingAnswers, permission: NotificationPermissionState): boolean {
  const { name, role, language, countryCode, city } = answers
  if (!role || !language || !countryCode || !city) return false

  const profile = useProfileStore.getState()
  const settings = useSettingsStore.getState()
  if (!profile.setName(name)) return false
  if (!profile.setLocation({ countryCode, city })) return false
  profile.setRole(role)
  profile.setMyLanguage(language)
  settings.setAppLanguage(language)
  settings.setConversationLanguage(defaultConversationLanguage(language, countryCode))
  const granted = permission === 'granted'
  settings.setNotificationsEnabled(granted)
  profile.completeOnboarding()

  // Best effort: delivery only exists once a VAPID key + backend are configured; never blocks the flow.
  if (granted && isPushConfigured()) subscribeToPush({ locale: language }).catch(() => undefined)
  return true
}
