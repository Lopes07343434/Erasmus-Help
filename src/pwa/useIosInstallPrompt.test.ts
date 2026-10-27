import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseInstallPromptResult } from './useInstallPrompt'
import { useIosInstallPrompt, wasDismissedRecently } from './useIosInstallPrompt'

const install = vi.hoisted(() => ({ current: {} as Partial<UseInstallPromptResult> }))
vi.mock('./useInstallPrompt', () => ({ useInstallPrompt: () => install.current }))

const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  install.current = { platform: 'ios', installed: false }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useIosInstallPrompt', () => {
  it('opens on its own after a short delay on iOS when the app is not installed', () => {
    const { result } = renderHook(() => useIosInstallPrompt())
    expect(result.current.open).toBe(false)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.open).toBe(true)
  })

  it.each([
    ['the app is already installed', { platform: 'ios', installed: true }],
    ['the device is not iOS', { platform: 'android', installed: false }],
  ] as const)('stays closed when %s', (_label, state) => {
    install.current = state
    const { result } = renderHook(() => useIosInstallPrompt())
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.open).toBe(false)
  })

  it('closes on dismiss and is not offered again for a week', () => {
    const first = renderHook(() => useIosInstallPrompt())
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    act(() => first.result.current.dismiss())
    expect(first.result.current.open).toBe(false)
    first.unmount()

    const second = renderHook(() => useIosInstallPrompt())
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(second.result.current.open).toBe(false)
  })

  it('is offered again once the dismissal has expired', () => {
    const now = Date.now()
    localStorage.setItem('eh:ios-install-dismissed', String(now - 8 * DAY_MS))
    expect(wasDismissedRecently(now)).toBe(false)
    const { result } = renderHook(() => useIosInstallPrompt())
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.open).toBe(true)
  })

  it('ignores a corrupted dismissal value', () => {
    localStorage.setItem('eh:ios-install-dismissed', 'not-a-number')
    expect(wasDismissedRecently()).toBe(false)
  })
})
