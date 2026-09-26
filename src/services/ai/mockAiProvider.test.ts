import { describe, expect, it } from 'vitest'
import { createMockAiProvider } from './mockAiProvider'

describe('mockAiProvider (dev only)', () => {
  const ai = createMockAiProvider({ correct: 0, practice: 0 })

  it('restores known phrases and reports the kinds of changes', async () => {
    await expect(ai.correct({ text: "ciao dov'è la stazione dei treni più vicina", language: 'it' })).resolves.toEqual({
      corrected: "Ciao, dov'è la stazione dei treni più vicina?",
      changes: ['punctuation', 'capitalization'],
    })
    const noAccents = await ai.correct({ text: "Ciao, dov'e la stazione dei treni piu vicina?", language: 'it' })
    expect(noAccents.changes).toEqual(['accents'])
  })

  it('generic text: capital first letter + final punctuation (question aware)', async () => {
    await expect(ai.correct({ text: 'where can i buy a ticket', language: 'en' })).resolves.toEqual({
      corrected: 'Where can i buy a ticket?',
      changes: ['capitalization', 'punctuation'],
    })
    await expect(ai.correct({ text: 'donde esta el baño', language: 'es' })).resolves.toMatchObject({ corrected: '¿Donde esta el baño?' })
    await expect(ai.correct({ text: 'Tudo bem.', language: 'pt-PT' })).resolves.toEqual({ corrected: 'Tudo bem.', changes: [] })
  })

  it('practice: opening with the name, then scripted turns', async () => {
    await expect(ai.practiceOpening({ scenario: 'cafe', language: 'it', nativeLanguage: 'pt-PT', userName: 'Ana' })).resolves.toEqual({
      reply: 'Ciao Ana! Oggi siamo al bar. Cosa prendi?',
      translation: 'Olá Ana! Hoje estamos no café. O que vais tomar?',
    })
    const opening = await ai.practiceOpening({ scenario: 'landlord', language: 'en', nativeLanguage: 'pl' })
    expect(opening.reply.startsWith('Hi!')).toBe(true)

    const first = await ai.practiceReply({
      scenario: 'cafe',
      language: 'it',
      nativeLanguage: 'pt-PT',
      history: [
        { role: 'assistant', text: 'Ciao!' },
        { role: 'user', text: 'Vorrei un cappuccino' },
      ],
    })
    expect(first).toEqual({ reply: 'Certo! Al banco o al tavolo?', translation: 'Claro! Ao balcão ou à mesa?' })
    await expect(ai.practiceReply({ scenario: 'cafe', language: 'it', nativeLanguage: 'en', history: [] })).rejects.toMatchObject({ code: 'invalid-input' })
  })
})
