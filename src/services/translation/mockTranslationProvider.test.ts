import { describe, expect, it } from 'vitest'
import { createMockTranslationProvider } from './mockTranslationProvider'

describe('mockTranslationProvider (dev only)', () => {
  const provider = createMockTranslationProvider(0)

  it('translates known sample phrases, tolerating STT-style input', async () => {
    await expect(provider.translate({ text: 'ola onde fica a estacao de comboios mais proxima', from: 'pt-PT', to: 'it' })).resolves.toEqual({
      text: "Ciao, dov'è la stazione dei treni più vicina?",
    })
    await expect(provider.translate({ text: 'Vorrei un cappuccino, per favore.', from: 'it', to: 'pl' })).resolves.toEqual({ text: 'Poproszę cappuccino.' })
  })

  it('marks unknown text as a demo output instead of pretending to translate', async () => {
    await expect(provider.translate({ text: 'the weather is nice', from: 'en', to: 'it' })).resolves.toEqual({ text: '[IT] the weather is nice' })
  })

  it('honours AbortSignal', async () => {
    const slow = createMockTranslationProvider(1000)
    const controller = new AbortController()
    const pending = slow.translate({ text: 'hi', from: 'en', to: 'de' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })
})
