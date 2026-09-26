import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioElement } from '@/services/audio/testUtils'
import { createAudioPlayerController, useAudioPlayer } from './useAudioPlayer'

function setup() {
  const audio = new FakeAudioElement()
  const createAudio = vi.fn(() => audio.asElement())
  const player = createAudioPlayerController({ createAudio })
  return { audio, player, createAudio }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared audio player', () => {
  it('creates the <audio> element lazily and plays synchronously inside the tap', () => {
    const { audio, player, createAudio } = setup()
    expect(createAudio).not.toHaveBeenCalled()
    player.play('m1', 'https://cdn/m1.webm', { durationMs: 7000 })
    expect(createAudio).toHaveBeenCalledOnce()
    expect(audio.src).toBe('https://cdn/m1.webm')
    expect(audio.play).toHaveBeenCalledOnce()
    expect(player.getState('m1')).toMatchObject({ status: 'loading', durationMs: 7000 })
    expect(player.getActiveId()).toBe('m1')

    audio.fire('playing')
    expect(player.getState('m1').status).toBe('playing')
  })

  it('only one message plays at a time; the previous one keeps its position', () => {
    const { audio, player } = setup()
    player.play('a', 'https://cdn/a.webm', { durationMs: 10_000 })
    audio.fire('playing')
    audio.currentTime = 4
    audio.fire('timeupdate')
    expect(player.getState('a')).toMatchObject({ currentTimeMs: 4000, progress: 0.4 })

    player.play('b', 'https://cdn/b.webm', { durationMs: 5000 })
    expect(audio.pause).toHaveBeenCalled()
    expect(player.getActiveId()).toBe('b')
    expect(player.getState('a')).toMatchObject({ status: 'paused', currentTimeMs: 4000 })
    expect(player.getState('b').status).toBe('loading')
    audio.fire('pause') // leftover event from "a" must not pause "b"
    expect(player.getState('b').status).toBe('loading')
    audio.fire('playing')
    expect(player.getState('b').status).toBe('playing')

    // back to "a": resumes from 4 s once metadata is there
    audio.currentTime = 0
    player.play('a', 'https://cdn/a.webm', { durationMs: 10_000 })
    expect(player.getState('b').status).toBe('idle')
    audio.loadMetadata(Number.POSITIVE_INFINITY) // WebM: keep the known duration
    expect(audio.currentTime).toBe(4)
    expect(player.getState('a').durationMs).toBe(10_000)
  })

  it('pause(), toggle() and ended', () => {
    const { audio, player } = setup()
    player.toggle('a', 'https://cdn/a.m4a')
    audio.fire('playing')
    player.toggle('a', 'https://cdn/a.m4a')
    expect(player.getState('a').status).toBe('paused')
    expect(audio.pause).toHaveBeenCalled()

    player.play('a', 'https://cdn/a.m4a')
    expect(audio.play).toHaveBeenCalledTimes(2) // resumed on the same source
    audio.fire('playing')
    audio.loadMetadata(3)
    audio.currentTime = 3
    audio.fire('timeupdate')
    audio.fire('pause')
    audio.fire('ended')
    expect(player.getState('a')).toMatchObject({ status: 'idle', currentTimeMs: 0, durationMs: 3000 })
  })

  it('resolves signed URLs once, unlocking the element inside the tap (iOS)', async () => {
    const { audio, player } = setup()
    const resolver = vi.fn(() => Promise.resolve('https://signed/a?token=1'))
    player.play('a', resolver, { durationMs: 2000 })
    expect(audio.load).toHaveBeenCalledOnce() // unlock while still in the gesture
    expect(audio.play).not.toHaveBeenCalled()
    await flush()
    expect(audio.src).toBe('https://signed/a?token=1')
    expect(audio.play).toHaveBeenCalledOnce()

    player.play('b', 'https://cdn/b.webm')
    player.play('a', resolver)
    expect(resolver).toHaveBeenCalledOnce() // cached URL → synchronous play
    expect(audio.src).toBe('https://signed/a?token=1')
  })

  it('Safari NotAllowedError leaves the message paused (next tap plays)', async () => {
    const { audio, player } = setup()
    audio.playOutcome = 'NotAllowedError'
    player.play('a', 'https://cdn/a.m4a')
    await flush()
    expect(player.getState('a')).toMatchObject({ status: 'paused', error: null })
  })

  it('media errors end in error state; playing again reloads', () => {
    const { audio, player } = setup()
    player.play('a', 'https://cdn/a.webm')
    audio.error = { code: 4 }
    audio.fire('error')
    expect(player.getState('a').status).toBe('error')
    expect(player.getState('a').error?.code).toBe('not-supported')

    audio.error = null
    player.play('a', 'https://cdn/a.webm')
    expect(player.getState('a')).toMatchObject({ status: 'loading', error: null })
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('seeks the active message or remembers the position of another one', () => {
    const { audio, player } = setup()
    player.seek('x', 3000, { durationMs: 8000 })
    expect(player.getState('x')).toMatchObject({ status: 'paused', currentTimeMs: 3000, durationMs: 8000 })
    player.seek('x', 99_000)
    expect(player.getState('x').currentTimeMs).toBe(8000) // clamped

    player.play('y', 'https://cdn/y.webm', { durationMs: 6000 })
    audio.loadMetadata(6)
    audio.fire('playing')
    player.seek('y', 2500)
    expect(audio.currentTime).toBe(2.5)
    expect(player.getState('y').currentTimeMs).toBe(2500)
  })

  it('creates object URLs for Blobs and revokes them when released', () => {
    const createObjectURL = vi.fn(() => 'blob:local/1')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const { audio, player } = setup()
    player.play('local', new Blob(['x'], { type: 'audio/webm' }), { durationMs: 1000 })
    expect(audio.src).toBe('blob:local/1')
    player.stop()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local/1')
    expect(player.getActiveId()).toBeNull()
    expect(audio.src).toBe('')
  })

  it('useAudioPlayer(id) follows the state of its own message only', () => {
    const { audio, player } = setup()
    const a = renderHook(() => useAudioPlayer('a', player))
    const b = renderHook(() => useAudioPlayer('b', player))
    act(() => a.result.current.play('https://cdn/a.webm', { durationMs: 4000 }))
    act(() => audio.fire('playing'))
    expect(a.result.current).toMatchObject({ status: 'playing', isActive: true, durationMs: 4000 })
    expect(b.result.current).toMatchObject({ status: 'idle', isActive: false })

    act(() => b.result.current.toggle('https://cdn/b.webm'))
    expect(a.result.current).toMatchObject({ status: 'idle', isActive: false })
    expect(b.result.current).toMatchObject({ status: 'loading', isActive: true })
  })
})
