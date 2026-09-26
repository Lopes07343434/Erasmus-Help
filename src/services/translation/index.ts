import { env } from '@/config/env'
import { AppError } from '../errors'
import { createHttpTranslationProvider } from './httpTranslationProvider'
import type { TranslationProvider } from './types'

export type * from './types'
export { MAX_TRANSLATION_CHARS } from './types'
export { runTranslationPipeline, type PipelineInput, type PipelineDeps, type PipelineOptions, type PipelineResult, type PipelineStage } from './pipeline'

const notConfigured: TranslationProvider = {
  translate: () => Promise.reject(new AppError('not-configured')),
}

function createProvider(): TranslationProvider {
  switch (env.translationProvider) {
    case 'http':
      return env.apiBaseUrl ? createHttpTranslationProvider(env.apiBaseUrl) : notConfigured
    case 'mock': {
      // Statically false in production builds → the mock and its sample data are tree-shaken away.
      if (!import.meta.env.DEV) return notConfigured
      let loading: Promise<TranslationProvider> | null = null
      return {
        async translate(req, signal) {
          loading ??= import('./mockTranslationProvider').then((m) => m.mockTranslationProvider)
          return (await loading).translate(req, signal)
        },
      }
    }
    case 'none':
      return notConfigured
  }
}

let provider: TranslationProvider | null = null

/** Translation provider selected by VITE_TRANSLATION_PROVIDER ('http' needs VITE_API_BASE_URL). */
export function getTranslationProvider(): TranslationProvider {
  provider ??= createProvider()
  return provider
}
