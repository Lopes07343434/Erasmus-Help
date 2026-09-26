import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { ROUTES } from '@/app/router'
import { signOutChat } from '@/services/chat'
import { clearGeocodingMemo } from '@/services/geo'
import { unsubscribeFromPush } from '@/services/notifications'
import { clearWeatherCache } from '@/services/weather'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTalkStore } from '@/pages/talk/talkStore'
import { useLanguagePairStore } from '@/pages/translate/languagePair'

/**
 * "Apagar dados deste dispositivo": removes the push subscription (best effort), signs out of the chat and drops its
 * local session/cache (best effort), resets and clears both persisted stores, drops the weather cache and the
 * geocoding memo, then restarts at /welcome.
 */
export function useDeleteDeviceData(): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    unsubscribeFromPush().catch(() => undefined)
    // Before the stores are reset: it reads the onboarding timestamp synchronously (no auto re-start after this).
    signOutChat().catch(() => undefined)
    useProfileStore.getState().reset()
    useSettingsStore.getState().reset()
    // reset() writes the defaults back to localStorage; remove the keys entirely.
    void useProfileStore.persist.clearStorage()
    void useSettingsStore.persist.clearStorage()
    // Session-only stores still hold the previous user's language pairs.
    useTalkStore.setState(useTalkStore.getInitialState(), true)
    useLanguagePairStore.setState(useLanguagePairStore.getInitialState(), true)
    clearWeatherCache()
    clearGeocodingMemo()
    // Service-worker runtime caches hold location-derived responses (weather / city search).
    if (typeof caches !== 'undefined') {
      for (const name of ['eh-weather', 'eh-geocoding']) caches.delete(name).catch(() => undefined)
    }
    void navigate(ROUTES.welcome, { replace: true })
  }, [navigate])
}
