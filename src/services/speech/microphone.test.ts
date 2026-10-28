import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { getMicrophonePermission, requestMicrophonePermission } from './microphone'

const withMic = (permissions?: Partial<Permissions>) =>
  ({ mediaDevices: { getUserMedia: vi.fn() }, permissions }) as unknown as Navigator

describe('getMicrophonePermission', () => {
  it('reads the real permission state', async () => {
    for (const state of ['granted', 'denied', 'prompt'] as const) {
      const query = vi.fn(() => Promise.resolve({ state } as PermissionStatus))
      await expect(getMicrophonePermission(withMic({ query }))).resolves.toBe(state)
      expect(query).toHaveBeenCalledWith({ name: 'microphone' })
    }
  })

  it('returns prompt when the state cannot be read', async () => {
    await expect(getMicrophonePermission(withMic())).resolves.toBe('prompt')
    const query = vi.fn(() => Promise.reject(new TypeError('microphone is not a valid permission name')))
    await expect(getMicrophonePermission(withMic({ query }))).resolves.toBe('prompt')
  })

  it('returns unsupported without any microphone API', async () => {
    await expect(getMicrophonePermission({} as Navigator)).resolves.toBe('unsupported')
  })
})

describe('requestMicrophonePermission', () => {
  const navWith = (getUserMedia: () => Promise<MediaStream>) => ({ mediaDevices: { getUserMedia } }) as unknown as Navigator

  it('asks the browser and releases the microphone right away', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream
    await expect(requestMicrophonePermission(navWith(() => Promise.resolve(stream)))).resolves.toBe('granted')
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('reports the real refusal instead of pretending', async () => {
    const refuse = () => Promise.reject(new DOMException('no', 'NotAllowedError'))
    await expect(requestMicrophonePermission(navWith(refuse))).resolves.toBe('denied')
  })

  it('throws not-supported without an API and unavailable when there is no microphone', async () => {
    await expect(requestMicrophonePermission({} as Navigator)).rejects.toMatchObject({ code: 'not-supported' })
    const missing = () => Promise.reject(new DOMException('none', 'NotFoundError'))
    const err: unknown = await requestMicrophonePermission(navWith(missing)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('unavailable')
  })
})
