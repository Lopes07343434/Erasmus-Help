import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { detectUiLocale, isLanguageCode, isUiLocale, type LanguageCode, type UiLocale } from '@/i18n/languages'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemePreference
  /** Language of the interface (menus, buttons, texts). */
  appLanguage: UiLocale
  /** Language used to communicate / translate into. Independent from appLanguage and myLanguage. */
  conversationLanguage: LanguageCode
  /** User preference. The real browser permission is read at runtime (Notification.permission). */
  notificationsEnabled: boolean
  /** The "push notifications are available" notice was opened or closed: it is never shown again. */
  pushAnnouncementSeen: boolean
}

interface SettingsState extends Settings {
  setTheme: (theme: ThemePreference) => void
  setAppLanguage: (locale: UiLocale) => void
  setConversationLanguage: (code: LanguageCode) => void
  setNotificationsEnabled: (enabled: boolean) => void
  markPushAnnouncementSeen: () => void
  reset: () => void
}

const defaults = (): Settings => ({
  theme: 'system',
  appLanguage: detectUiLocale(),
  conversationLanguage: 'en',
  notificationsEnabled: false,
  pushAnnouncementSeen: false,
})

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults(),
      setTheme: (theme) => set({ theme }),
      setAppLanguage: (locale) => {
        if (isUiLocale(locale)) set({ appLanguage: locale })
      },
      setConversationLanguage: (code) => {
        if (isLanguageCode(code)) set({ conversationLanguage: code })
      },
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      markPushAnnouncementSeen: () => set({ pushAnnouncementSeen: true }),
      reset: () => set(defaults()),
    }),
    {
      name: 'eh:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, appLanguage, conversationLanguage, notificationsEnabled, pushAnnouncementSeen }) => ({
        theme,
        appLanguage,
        conversationLanguage,
        notificationsEnabled,
        pushAnnouncementSeen,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>
        return {
          ...current,
          theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : current.theme,
          appLanguage: isUiLocale(p.appLanguage) ? p.appLanguage : current.appLanguage,
          conversationLanguage: isLanguageCode(p.conversationLanguage) ? p.conversationLanguage : current.conversationLanguage,
          notificationsEnabled: typeof p.notificationsEnabled === 'boolean' ? p.notificationsEnabled : current.notificationsEnabled,
          pushAnnouncementSeen: typeof p.pushAnnouncementSeen === 'boolean' ? p.pushAnnouncementSeen : current.pushAnnouncementSeen,
        }
      },
    },
  ),
)
