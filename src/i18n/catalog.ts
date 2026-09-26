import type { UiLocale } from './languages'
import type { MessageKey, MessageParams, MessagesShape, PluralKey } from './types'

const loaders: Record<UiLocale, () => Promise<{ default: MessagesShape }>> = {
  'pt-PT': () => import('./messages/pt-PT'),
  en: () => import('./messages/en'),
  pl: () => import('./messages/pl'),
}

const cache = new Map<UiLocale, MessagesShape>()

export async function loadMessages(locale: UiLocale): Promise<MessagesShape> {
  const hit = cache.get(locale)
  if (hit) return hit
  const mod = await loaders[locale]()
  cache.set(locale, mod.default)
  return mod.default
}

export const getCachedMessages = (locale: UiLocale): MessagesShape | undefined => cache.get(locale)

function lookup(messages: MessagesShape, key: string): string | undefined {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

export function createTranslator(locale: UiLocale, messages: MessagesShape) {
  const plural = new Intl.PluralRules(locale)
  const t = (key: MessageKey, params?: MessageParams): string => {
    const found = lookup(messages, key)
    if (found === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing ${locale}:${key}`)
      return key
    }
    return interpolate(found, params)
  }
  const tn = (key: PluralKey, count: number, params?: MessageParams): string => {
    const category = plural.select(count)
    const found = lookup(messages, `${key}_${category}`) ?? lookup(messages, `${key}_other`)
    return found === undefined ? key : interpolate(found, { count, ...params })
  }
  return { t, tn }
}
