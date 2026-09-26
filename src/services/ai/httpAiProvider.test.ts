import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpAiProvider, parseCorrectionResponse, parsePracticeResponse } from './httpAiProvider'
import type { PracticeMessage, PracticeScenario } from './types'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sentBody = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, i = 0): unknown => JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body))

describe('httpAiProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const ai = createHttpAiProvider('https://api.test')

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('correct(): POST /correct with { text, language }; unknown change kinds are dropped', async () => {
    fetchMock.mockResolvedValue(json({ corrected: 'Ciao, come stai?', changes: ['punctuation', 'capitalization', 'rewrite', 3] }))
    await expect(ai.correct({ text: 'ciao come stai', language: 'it' })).resolves.toEqual({
      corrected: 'Ciao, come stai?',
      changes: ['punctuation', 'capitalization'],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/correct')
    expect(sentBody(fetchMock)).toEqual({ text: 'ciao come stai', language: 'it' })
  })

  it('correct(): validates input and output', async () => {
    await expect(ai.correct({ text: '', language: 'it' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(ai.correct({ text: 'x'.repeat(1001), language: 'it' })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(parseCorrectionResponse({ corrected: 'Hi.' }, 'hi')).toEqual({ corrected: 'Hi.', changes: [] })
    for (const body of [null, { corrected: 1 }, { corrected: '  ' }, { corrected: 'a much much longer hallucinated text' }]) {
      expect(() => parseCorrectionResponse(body, 'hi')).toThrow(expect.objectContaining({ code: 'unavailable' }))
    }
  })

  it('practiceOpening(): POST /practice with an empty history and the optional name', async () => {
    fetchMock.mockResolvedValue(json({ reply: 'Ciao Ana! Cosa prendi?', translation: 'Olá Ana! O que vais tomar?' }))
    await expect(ai.practiceOpening({ scenario: 'cafe', language: 'it', nativeLanguage: 'pt-PT', userName: ' Ana ' })).resolves.toEqual({
      reply: 'Ciao Ana! Cosa prendi?',
      translation: 'Olá Ana! O que vais tomar?',
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/practice')
    expect(sentBody(fetchMock)).toEqual({ scenario: 'cafe', language: 'it', nativeLanguage: 'pt-PT', history: [], userName: 'Ana' })
  })

  it('practiceReply(): sends the last 20 messages and requires a user turn last', async () => {
    fetchMock.mockResolvedValue(json({ reply: 'Certo!', translation: 'Claro!' }))
    const history: PracticeMessage[] = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: `m${i}` }))
    await ai.practiceReply({ scenario: 'office', language: 'it', nativeLanguage: 'en', history })
    const body = sentBody(fetchMock) as { history: PracticeMessage[] }
    expect(body.history).toHaveLength(20)
    expect(body.history.at(-1)).toEqual({ role: 'user', text: 'm24' })

    await expect(
      ai.practiceReply({ scenario: 'office', language: 'it', nativeLanguage: 'en', history: [{ role: 'assistant', text: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(
      ai.practiceReply({ scenario: 'pub' as unknown as PracticeScenario, language: 'it', nativeLanguage: 'en', history: [{ role: 'user', text: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('practice responses are validated', async () => {
    expect(parsePracticeResponse({ reply: ' Sì ' })).toEqual({ reply: 'Sì', translation: '' })
    for (const body of [undefined, { reply: '' }, { reply: 7 }, { reply: 'x'.repeat(2001), translation: '' }]) {
      expect(() => parsePracticeResponse(body)).toThrow(expect.objectContaining({ code: 'unavailable' }))
    }
    fetchMock.mockResolvedValue(json({}, 500))
    await expect(ai.practiceOpening({ scenario: 'cafe', language: 'it', nativeLanguage: 'en' })).rejects.toMatchObject({ code: 'unavailable' })
  })
})
