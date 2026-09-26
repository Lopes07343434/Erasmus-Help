import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isLanguageCode, type LanguageCode } from '@/i18n/languages'
import type { Profile, UserLocation, UserRole } from '@/types/profile'
import { isCountryCode, sanitizeText, validateName } from '@/utils/validation'

/**
 * Local-first profile. Phase 1 keeps it on the device (localStorage).
 * A Supabase-backed repository will sync it later without changing this API.
 */
interface ProfileState extends Profile {
  setName: (name: string) => boolean
  setRole: (role: UserRole) => void
  setMyLanguage: (code: LanguageCode) => void
  setLocation: (location: UserLocation) => boolean
  completeOnboarding: () => void
  reset: () => void
}

const initial: Profile = {
  name: '',
  role: null,
  myLanguage: null,
  location: null,
  onboardingCompletedAt: null,
}

function sanitizeLocation(loc: UserLocation): UserLocation | null {
  if (!isCountryCode(loc.countryCode)) return null
  const name = sanitizeText(loc.city.name, 80)
  if (!name) return null
  const num = (n: unknown, min: number, max: number) => (typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : undefined)
  return {
    countryCode: loc.countryCode,
    city: {
      name,
      latitude: num(loc.city.latitude, -90, 90),
      longitude: num(loc.city.longitude, -180, 180),
      timezone: loc.city.timezone ? sanitizeText(loc.city.timezone, 64) : undefined,
      admin1: loc.city.admin1 ? sanitizeText(loc.city.admin1, 80) : undefined,
    },
  }
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...initial,
      setName: (raw) => {
        const r = validateName(raw)
        if (r.ok) set({ name: r.value })
        return r.ok
      },
      setRole: (role) => set({ role }),
      setMyLanguage: (code) => {
        if (isLanguageCode(code)) set({ myLanguage: code })
      },
      setLocation: (loc) => {
        const clean = sanitizeLocation(loc)
        if (clean) set({ location: clean })
        return clean !== null
      },
      completeOnboarding: () => set({ onboardingCompletedAt: new Date().toISOString() }),
      reset: () => set(initial),
    }),
    {
      name: 'eh:profile',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ name, role, myLanguage, location, onboardingCompletedAt }) => ({ name, role, myLanguage, location, onboardingCompletedAt }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Profile>
        const name = typeof p.name === 'string' ? (validateName(p.name).ok ? p.name : '') : ''
        return {
          ...current,
          name,
          role: p.role === 'student' || p.role === 'monitor' ? p.role : null,
          myLanguage: isLanguageCode(p.myLanguage) ? p.myLanguage : null,
          location: p.location ? sanitizeLocation(p.location) : null,
          onboardingCompletedAt: typeof p.onboardingCompletedAt === 'string' && name ? p.onboardingCompletedAt : null,
        }
      },
    },
  ),
)

export const selectIsOnboarded = (s: ProfileState) => s.onboardingCompletedAt !== null
