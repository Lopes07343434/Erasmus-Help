import { describe, expect, it } from 'vitest'
import type { AppErrorCode } from '@/services/errors'
import { createTranslator } from '@/i18n/catalog'
import en from '@/i18n/messages/en'
import pl from '@/i18n/messages/pl'
import ptPT from '@/i18n/messages/pt-PT'
import { errorI18nKey } from './errorI18nKey'

const CODES: AppErrorCode[] = [
  'offline',
  'timeout',
  'unavailable',
  'not-configured',
  'not-supported',
  'permission-denied',
  'no-speech',
  'invalid-input',
  'not-found',
  'rate-limited',
  'aborted',
  'unknown',
]

describe('errorI18nKey', () => {
  it('maps kebab-case codes to camelCase message keys', () => {
    expect(errorI18nKey('not-configured')).toBe('errors.notConfigured')
    expect(errorI18nKey('permission-denied')).toBe('errors.permissionDenied')
    expect(errorI18nKey('offline')).toBe('errors.offline')
  })

  it('resolves a title and body for every code in every UI locale', () => {
    for (const [locale, messages] of [['pt-PT', ptPT], ['en', en], ['pl', pl]] as const) {
      const { t } = createTranslator(locale, messages)
      for (const code of CODES) {
        const key = errorI18nKey(code)
        expect(t(`${key}.title`)).not.toBe(`${key}.title`)
        expect(t(`${key}.body`)).not.toBe(`${key}.body`)
      }
    }
  })
})
