import { useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSettingsStore } from '@/stores/settingsStore'

const THEME_COLOR = { light: '#F3F4F8', dark: '#0A0D16' } as const

/** Applies the theme preference to <html data-theme> (also set pre-paint by the inline script in index.html). */
export function ThemeController() {
  const theme = useSettingsStore((s) => s.theme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = THEME_COLOR[resolved]
    })
  }, [resolved])

  return null
}

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}
