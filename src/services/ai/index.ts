import { env } from '@/config/env'
import { AppError } from '../errors'
import { createHttpAiProvider } from './httpAiProvider'
import type { AiProvider } from './types'

export type * from './types'
export { PRACTICE_SCENARIOS, CORRECTION_KINDS, isPracticeScenario, isCorrectionKind } from './types'

const notConfigured: AiProvider = {
  correct: () => Promise.reject(new AppError('not-configured')),
  practiceReply: () => Promise.reject(new AppError('not-configured')),
  practiceOpening: () => Promise.reject(new AppError('not-configured')),
}

/** Loads the dev-only mock on first use (statically removed from production builds). */
function lazyMock(): AiProvider {
  let loading: Promise<AiProvider> | null = null
  const load = () => (loading ??= import('./mockAiProvider').then((m) => m.mockAiProvider))
  return {
    correct: async (req, signal) => (await load()).correct(req, signal),
    practiceReply: async (req, signal) => (await load()).practiceReply(req, signal),
    practiceOpening: async (req, signal) => (await load()).practiceOpening(req, signal),
  }
}

function createProvider(): AiProvider {
  switch (env.aiProvider) {
    case 'http':
      return env.apiBaseUrl ? createHttpAiProvider(env.apiBaseUrl) : notConfigured
    case 'mock':
      return import.meta.env.DEV ? lazyMock() : notConfigured
    case 'none':
      return notConfigured
  }
}

let provider: AiProvider | null = null

/** AI provider (correction + practice) selected by VITE_AI_PROVIDER ('http' needs VITE_API_BASE_URL). */
export function getAiProvider(): AiProvider {
  provider ??= createProvider()
  return provider
}

/** True when an AI backend is configured (correction is skipped silently otherwise). */
export const isAiConfigured = (): boolean => (env.aiProvider === 'http' && env.apiBaseUrl !== null) || (env.aiProvider === 'mock' && import.meta.env.DEV)
