import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { createTranslator, getCachedMessages, loadMessages } from './catalog'
import type { LanguageCode, UiLocale } from './languages'
import type { MessageKey, MessageParams, MessagesShape, PluralKey } from './types'

export interface I18nValue {
  /** Current app (UI) language. Not the user's language nor the conversation language. */
  locale: UiLocale
  t: (key: MessageKey, params?: MessageParams) => string
  tn: (key: PluralKey, count: number, params?: MessageParams) => string
  /** Name of any registry language, written in the current UI language. */
  languageName: (code: LanguageCode) => string
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSettingsStore((s) => s.appLanguage)
  const [loaded, setLoaded] = useState<{ locale: UiLocale; messages: MessagesShape } | null>(() => {
    const cached = getCachedMessages(locale)
    return cached ? { locale, messages: cached } : null
  })

  useEffect(() => {
    let cancelled = false
    loadMessages(locale).then(
      (messages) => {
        if (cancelled) return
        setLoaded({ locale, messages })
        document.documentElement.lang = locale
      },
      (err: unknown) => {
        // Chunk failed (e.g. offline before the SW cached it): keep the current language instead of breaking.
        if (import.meta.env.DEV) console.warn('[i18n] could not load', locale, err)
      },
    )
    return () => {
      cancelled = true
    }
  }, [locale])

  const value = useMemo<I18nValue | null>(() => {
    if (!loaded) return null
    const { t, tn } = createTranslator(loaded.locale, loaded.messages)
    const dateFmt = new Map<string, Intl.DateTimeFormat>()
    return {
      locale: loaded.locale,
      t,
      tn,
      languageName: (code) => t(`languages.${code}`),
      formatDate: (date, options) => {
        const k = JSON.stringify(options ?? {})
        let f = dateFmt.get(k)
        if (!f) dateFmt.set(k, (f = new Intl.DateTimeFormat(loaded.locale, options)))
        return f.format(date)
      },
      formatNumber: (n, options) => new Intl.NumberFormat(loaded.locale, options).format(n),
    }
  }, [loaded])

  // Messages for the initial locale are preloaded in main.tsx, so this only happens on a cold cache.
  if (!value) return null
  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): I18nValue {
  const ctx = use(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
