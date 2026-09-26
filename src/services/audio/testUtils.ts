// Test-only fake <audio> element for the shared audio player (jsdom does not implement media playback).
import { vi } from 'vitest'

export class FakeAudioElement extends EventTarget {
  src = ''
  preload = ''
  duration = Number.NaN
  currentTime = 0
  readyState = 0
  paused = true
  error: { code: number } | null = null
  /** What the next play() does: resolve, or reject with a DOMException of this name. */
  playOutcome: 'resolve' | string = 'resolve'

  play = vi.fn(() => {
    if (this.playOutcome !== 'resolve') return Promise.reject(new DOMException('play failed', this.playOutcome))
    this.paused = false
    return Promise.resolve()
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = ''
  })

  fire(type: string) {
    this.dispatchEvent(new Event(type))
  }

  /** Simulates metadata arriving (duration in seconds; Infinity like Chrome WebM). */
  loadMetadata(durationSeconds: number) {
    this.duration = durationSeconds
    this.readyState = 1
    this.fire('loadedmetadata')
  }

  asElement(): HTMLAudioElement {
    return this as unknown as HTMLAudioElement
  }
}
