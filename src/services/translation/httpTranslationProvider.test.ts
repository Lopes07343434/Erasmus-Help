import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpTranslationProvider, parseTranslationResponse } from './httpTranslationProvider'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('httpTranslationProvider', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const provider = createHttpTranslationProvider('https://api.test')

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs { text, source, target } to /translate and returns the validated translation', async () => {
    fetchMock.mockResolvedValue(json({ translation: '  Ciao!  ' }))
    await expect(provider.translate({ text: ' Olá! ', from: 'pt-PT', to: 'it' })).resolves.toEqual({ text: 'Ciao!' })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.test/translate')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('omit')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Olá!', source: 'pt-PT', target: 'it' })
  })

  it('rejects invalid input without calling the backend', async () => {
    await expect(provider.translate({ text: '   ', from: 'en', to: 'it' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(provider.translate({ text: 'a'.repeat(1001), from: 'en', to: 'it' })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads as unavailable', async () => {
    for (const body of [null, [], { translated: 'x' }, { translation: 42 }, { translation: '   ' }, { translation: 'x'.repeat(5001) }]) {
      expect(() => parseTranslationResponse(body)).toThrow(expect.objectContaining({ code: 'unavailable' }))
    }
    fetchMock.mockResolvedValue(json({ nope: true }))
    await expect(provider.translate({ text: 'hi', from: 'en', to: 'it' })).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('maps HTTP errors and aborts', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 429))
    await expect(provider.translate({ text: 'hi', from: 'en', to: 'it' })).rejects.toMatchObject({ code: 'rate-limited' })
    fetchMock.mockResolvedValueOnce(json({}, 503))
    await expect(provider.translate({ text: 'hi', from: 'en', to: 'it' })).rejects.toMatchObject({ code: 'unavailable' })

    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const pending = provider.translate({ text: 'hi', from: 'en', to: 'it' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })
})
