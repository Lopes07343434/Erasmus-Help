import { RouterProvider } from 'react-router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeController } from './ThemeController'
import { router } from './router'

export function App() {
  return (
    <I18nProvider>
      <ThemeController />
      <RouterProvider router={router} />
    </I18nProvider>
  )
}
