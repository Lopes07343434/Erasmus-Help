import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import type { AiProvider, CorrectionResult } from '../ai/types'
import { runTranslationPipeline, type PipelineStage } from './pipeline'
import type { TranslationProvider } from './types'

const translator = (impl?: TranslationProvider['translate']) => {
  const translate = vi.fn<TranslationProvider['translate']>(impl ?? ((req) => Promise.resolve({ text: `[${req.to}] ${req.text}` })))
  return { translate }
}
const corrector = (impl: AiProvider['correct']) => ({ correct: vi.fn<AiProvider['correct']>(impl) })

describe('runTranslationPipeline', () => {
  it('corrects, then translates the corrected text, keeping the original apart', async () => {
    const t = translator()
    const c = corrector(() => Promise.resolve({ corrected: 'Hello, world.', changes: ['punctuation', 'capitalization'] }))
    const stages: PipelineStage[] = []
    const out = await runTranslationPipeline({ transcript: ' hello world ', from: 'en', to: 'it' }, { translator: t, corrector: c }, { onStage: (s) => stages.push(s) })
    expect(out).toEqual({ original: 'hello world', corrected: 'Hello, world.', corrections: ['punctuation', 'capitalization'], translation: '[it] Hello, world.' })
    expect(c.correct).toHaveBeenCalledWith({ text: 'hello world', language: 'en' }, expect.any(AbortSignal))
    expect(stages).toEqual(['correcting', 'translating'])
  })

  it('correction failure is non-fatal', async () => {
    const out = await runTranslationPipeline(
      { transcript: 'hello', from: 'en', to: 'it' },
      { translator: translator(), corrector: corrector(() => Promise.reject(new AppError('unavailable'))) },
    )
    expect(out).toEqual({ original: 'hello', corrected: null, corrections: [], translation: '[it] hello' })
  })

  it('a hanging correction times out and translation goes on', async () => {
    const out = await runTranslationPipeline(
      { transcript: 'hello', from: 'en', to: 'it' },
      { translator: translator(), corrector: corrector(() => new Promise<CorrectionResult>(() => {})) },
      { correctionTimeoutMs: 10 },
    )
    expect(out.corrected).toBeNull()
    expect(out.translation).toBe('[it] hello')
  })

  it('unchanged corrections → corrected null; unknown change kinds are dropped', async () => {
    const same = await runTranslationPipeline(
      { transcript: 'Hello.', from: 'en', to: 'it' },
      { translator: translator(), corrector: corrector(() => Promise.resolve({ corrected: 'Hello.', changes: ['punctuation'] })) },
    )
    expect(same.corrected).toBeNull()
    expect(same.corrections).toEqual([])
    const weird = await runTranslationPipeline(
      { transcript: 'helo', from: 'en', to: 'it' },
      { translator: translator(), corrector: corrector(() => Promise.resolve({ corrected: 'Hello', changes: ['spelling', 'magic', 'spelling'] as CorrectionResult['changes'] })) },
    )
    expect(weird.corrections).toEqual(['spelling'])
  })

  it('same source and target language skips the translator', async () => {
    const t = translator()
    const out = await runTranslationPipeline({ transcript: 'olá', from: 'pt-PT', to: 'pt-PT' }, { translator: t })
    expect(out.translation).toBe('olá')
    expect(t.translate).not.toHaveBeenCalled()
  })

  it('propagates translation errors and rejects empty input', async () => {
    const failing = translator(() => Promise.reject(new AppError('rate-limited')))
    await expect(runTranslationPipeline({ transcript: 'hi', from: 'en', to: 'it' }, { translator: failing })).rejects.toMatchObject({ code: 'rate-limited' })
    await expect(runTranslationPipeline({ transcript: '  ', from: 'en', to: 'it' }, { translator: translator() })).rejects.toMatchObject({ code: 'invalid-input' })
    const empty = translator(() => Promise.resolve({ text: ' ' }))
    await expect(runTranslationPipeline({ transcript: 'hi', from: 'en', to: 'it' }, { translator: empty })).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('supports AbortSignal (during correction and before start)', async () => {
    const controller = new AbortController()
    const t = translator()
    const pending = runTranslationPipeline(
      { transcript: 'hi', from: 'en', to: 'it' },
      { translator: t, corrector: corrector(() => new Promise<CorrectionResult>(() => {})) },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    expect(t.translate).not.toHaveBeenCalled()
    await expect(runTranslationPipeline({ transcript: 'hi', from: 'en', to: 'it' }, { translator: t }, { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
