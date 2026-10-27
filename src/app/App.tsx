import { RouterProvider } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { IosInstallPrompt } from '@/components/pwa/IosInstallPrompt'
import { ThemeController } from './ThemeController'
import { router } from './router'

export function App() {
  return (
    <I18nProvider>
      <ThemeController />
      <RouterProvider router={router} />
      <IosInstallPrompt />
    </I18nProvider>
  )
}
