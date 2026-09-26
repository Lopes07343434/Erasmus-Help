import type { LanguageCode } from '@/i18n/languages'

export type UserRole = 'student' | 'monitor'

export interface CityLocation {
  name: string
  /** Present when the city was picked from geocoding results; used by the weather service. */
  latitude?: number
  longitude?: number
  timezone?: string
  admin1?: string
}

export interface UserLocation {
  /** ISO 3166-1 alpha-2, upper case (e.g. "IT"). */
  countryCode: string
  city: CityLocation
}

export interface Profile {
  name: string
  role: UserRole | null
  /** The user's main language ("Meu idioma"). Not the app language, not the conversation language. */
  myLanguage: LanguageCode | null
  location: UserLocation | null
  onboardingCompletedAt: string | null
}

export const NAME_MAX_LENGTH = 40
