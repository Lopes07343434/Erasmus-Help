import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { loadMessages } from '@/i18n/catalog'
import { DEFAULT_UI_LOCALE } from '@/i18n/languages'
import { registerServiceWorker } from '@/pwa/useServiceWorker'
import { selectIsOnboarded, useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import '@/styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

// First run: the onboarding is in English until the user picks their language there.
if (!selectIsOnboarded(useProfileStore.getState())) useSettingsStore.getState().setAppLanguage(DEFAULT_UI_LOCALE)

// Preload the active locale so the first paint is already translated (no flash of keys).
await loadMessages(useSettingsStore.getState().appLanguage)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline shell from the very first visit (onboarding included), not only once AppLayout mounts.
registerServiceWorker()
