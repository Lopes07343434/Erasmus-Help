import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { loadMessages } from '@/i18n/catalog'
import { registerServiceWorker } from '@/pwa/useServiceWorker'
import { useSettingsStore } from '@/stores/settingsStore'
import '@/styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

// Preload the active locale so the first paint is already translated (no flash of keys).
await loadMessages(useSettingsStore.getState().appLanguage)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline shell from the very first visit (onboarding included), not only once AppLayout mounts.
registerServiceWorker()
