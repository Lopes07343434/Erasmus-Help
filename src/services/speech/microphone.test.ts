import { describe, expect, it, vi } from 'vitest'
import { getMicrophonePermission } from './microphone'

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
