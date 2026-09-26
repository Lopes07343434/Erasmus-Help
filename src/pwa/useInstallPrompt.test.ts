import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { detectPlatform, useInstallPrompt } from './useInstallPrompt'

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5, 'ios'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 5, 'android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', 0, 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0, 'desktop'],
    ['SomeUnknownDevice/1.0', 0, 'other'],
  ] as const)('%s → %s', (ua, touchPoints, expected) => {
    expect(detectPlatform(ua, touchPoints)).toBe(expected)
  })
})

describe('useInstallPrompt', () => {
  it('is unavailable until the browser offers an install prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    await expect(result.current.promptInstall()).resolves.toBe('unavailable')
  })

  it('captures beforeinstallprompt and uses it exactly once', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const prompt = vi.fn(async () => undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      platforms: ['web'],
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
      prompt,
    })

    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(result.current.canInstall).toBe(true)

    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.promptInstall()
    })
    expect(outcome).toBe('accepted')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(result.current.canInstall).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.installed).toBe(true)
  })
})
