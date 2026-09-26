import { AppError, type AppErrorCode } from '../errors'
import { getLanguage } from '@/i18n/languages'
import type { SpeechHandlers, SpeechPlayback, SpeechSynthesizer } from './types'

/*
 * Text-to-speech through window.speechSynthesis. Available in all modern browsers; the voice list depends
 * on the OS (a language may have no voice installed → the engine falls back to its default voice).
 * Browser quirks handled here:
 *  - voices load asynchronously (Chrome returns [] until `voiceschanged`) → wait up to `voicesTimeoutMs`;
 *  - Chrome stops long utterances after ~15 s and may garbage-collect utterances before `end` fires →
 *    text is split into short chunks, every utterance is referenced until it ends, and a watchdog
 *    advances if `end` never arrives;
 *  - a paused engine (tab switch) is resumed before speaking;
 *  - iOS Safari only allows speech started from a user gesture → `warmUp()` unlocks it.
 */

export interface SpeechEngine {
  synth: SpeechSynthesis
  Utterance: typeof SpeechSynthesisUtterance
}

function findSpeechEngine(): SpeechEngine | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null
  return { synth: window.speechSynthesis, Utterance: SpeechSynthesisUtterance }
}

const normTag = (tag: string) => tag.replace(/_/g, '-').toLowerCase()
const baseTag = (tag: string) => normTag(tag).split('-')[0] ?? ''

/**
 * Best voice for a BCP-47 tag: exact tag (pt-PT) first, then same base language (pt-BR).
 * Ties: "natural/neural/enhanced/premium" voices, then on-device voices (work offline, no Chrome cut-off),
 * then the platform default. Returns null when no voice matches (the engine then uses `utterance.lang`).
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], speechTag: string): SpeechSynthesisVoice | null {
  const want = normTag(speechTag)
  const wantBase = baseTag(speechTag)
  let best: SpeechSynthesisVoice | null = null
  let bestScore = 0
  for (const voice of voices) {
    let score = normTag(voice.lang) === want ? 100 : baseTag(voice.lang) === wantBase ? 50 : 0
    if (score === 0) continue
    if (/natural|neural|enhanced|premium/i.test(voice.name)) score += 6
    if (voice.localService) score += 2
    if (voice.default) score += 1
    if (score > bestScore) {
      best = voice
      bestScore = score
    }
  }
  return best
}

/** Splits text into sentence-sized chunks of at most `max` characters (Chrome long-utterance workaround). */
export function splitForSpeech(text: string, max = 200): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]

  const chunks: string[] = []
  let current = ''
  const flush = () => {
    const t = current.trim()
    if (t) chunks.push(t)
    current = ''
  }
  const sentences = clean.match(/[^.!?…。！？]+[.!?…。！？]*\s*/g) ?? [clean]
  for (const sentence of sentences) {
    if ((current + sentence).trim().length <= max) {
      current += sentence
      continue
    }
    flush()
    if (sentence.trim().length <= max) {
      current = sentence
      continue
    }
    for (const word of sentence.split(' ')) {
      if (!word) continue
      if ((current ? `${current} ${word}` : word).length <= max) {
        current = current ? `${current} ${word}` : word
        continue
      }
      flush()
      let rest = word
      while (rest.length > max) {
        chunks.push(rest.slice(0, max))
        rest = rest.slice(max)
      }
      current = rest
    }
  }
  flush()
  return chunks
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function mapSynthesisError(code: string, online: boolean = isOnline()): AppErrorCode {
  switch (code) {
    case 'canceled':
    case 'interrupted':
      return 'aborted'
    case 'not-allowed':
      return 'permission-denied'
    case 'language-unavailable':
    case 'voice-unavailable':
      return 'not-supported'
    case 'network':
      return online ? 'unavailable' : 'offline'
    case 'text-too-long':
    case 'invalid-argument':
      return 'invalid-input'
    case 'audio-busy':
    case 'audio-hardware':
    case 'synthesis-unavailable':
    case 'synthesis-failed':
      return 'unavailable'
    default:
      return 'unknown'
  }
}

export interface WebSpeechSynthesizerOptions {
  /** Injected in tests; defaults to window.speechSynthesis + SpeechSynthesisUtterance. */
  getEngine?: () => SpeechEngine | null
  /** How long to wait for `voiceschanged` when the voice list is empty. */
  voicesTimeoutMs?: number
  rate?: number
}

interface Job {
  stopped: boolean
  /** Stops the job without calling any handler. */
  silence(): void
}

export function createWebSpeechSynthesizer(options: WebSpeechSynthesizerOptions = {}): SpeechSynthesizer {
  const getEngine = options.getEngine ?? findSpeechEngine
  const voicesTimeoutMs = options.voicesTimeoutMs ?? 1500
  const rate = options.rate ?? 1
  let current: Job | null = null
  let warmed = false

  return {
    isSupported: () => getEngine() !== null,

    warmUp() {
      const engine = getEngine()
      if (!engine || warmed) return
      warmed = true
      try {
        engine.synth.getVoices() // kicks off async voice loading in Chrome
        const u = new engine.Utterance(' ')
        u.volume = 0
        engine.synth.speak(u)
      } catch {
        /* best effort */
      }
    },

    speak(text, language, handlers: SpeechHandlers = {}): SpeechPlayback {
      const engine = getEngine()
      const cleanups: (() => void)[] = []
      const job: Job = {
        stopped: false,
        silence() {
          job.stopped = true
          cleanups.forEach((fn) => fn())
          cleanups.length = 0
        },
      }
      const playback: SpeechPlayback = {
        cancel() {
          if (job.stopped) return
          job.silence()
          if (current === job) {
            current = null
            engine?.synth.cancel()
          }
        },
      }
      const failAsync = (code: AppErrorCode) => {
        job.stopped = true
        queueMicrotask(() => handlers.onError?.(new AppError(code)))
      }

      if (!engine) {
        failAsync('not-supported')
        return playback
      }
      const chunks = splitForSpeech(text)
      if (chunks.length === 0) {
        failAsync('invalid-input')
        return playback
      }

      // Only one playback at a time: silence the previous job, then flush the engine queue.
      current?.silence()
      current = job
      engine.synth.cancel()

      const { synth, Utterance } = engine
      const tag = getLanguage(language).speechTag
      const utterances: SpeechSynthesisUtterance[] = [] // strong refs: Chrome may GC them and never fire `end`
      let started = false
      let at = -1
      let watchdog: ReturnType<typeof setTimeout> | undefined
      cleanups.push(() => clearTimeout(watchdog))

      const finish = (err?: AppError) => {
        if (job.stopped) return
        job.silence()
        if (current === job) current = null
        utterances.length = 0
        if (err) handlers.onError?.(err)
        else handlers.onEnd?.()
      }

      const speakChunk = (i: number, voice: SpeechSynthesisVoice | null) => {
        if (job.stopped) return
        clearTimeout(watchdog)
        const chunk = chunks[i]
        if (chunk === undefined) return finish()
        at = i
        const u = new Utterance(chunk)
        u.lang = tag
        if (voice) u.voice = voice
        u.rate = rate
        u.pitch = 1
        u.onstart = () => {
          if (job.stopped || started) return
          started = true
          handlers.onStart?.()
        }
        u.onend = () => {
          if (job.stopped || at !== i) return
          speakChunk(i + 1, voice)
        }
        u.onerror = (ev) => {
          if (job.stopped || at !== i) return
          finish(new AppError(mapSynthesisError(ev.error)))
        }
        utterances.push(u)
        if (synth.paused) synth.resume()
        synth.speak(u)

        // Watchdog: if `end` never fires, advance once the engine is idle (or after 3 long waits).
        let waits = 0
        const arm = () => {
          watchdog = setTimeout(() => {
            if (job.stopped || at !== i) return
            waits += 1
            if (synth.speaking && waits < 3) return arm()
            speakChunk(i + 1, voice)
          }, 8000 + chunk.length * 150)
        }
        arm()
      }

      const voices = synth.getVoices()
      if (voices.length > 0) {
        speakChunk(0, pickVoice(voices, tag))
      } else {
        let waiting = true
        const onVoices = () => {
          if (!waiting) return
          waiting = false
          synth.removeEventListener('voiceschanged', onVoices)
          clearTimeout(timer)
          speakChunk(0, pickVoice(synth.getVoices(), tag))
        }
        const timer = setTimeout(onVoices, voicesTimeoutMs)
        synth.addEventListener('voiceschanged', onVoices)
        cleanups.push(() => {
          waiting = false
          clearTimeout(timer)
          synth.removeEventListener('voiceschanged', onVoices)
        })
      }

      return playback
    },
  }
}

export const webSpeechSynthesizer: SpeechSynthesizer = createWebSpeechSynthesizer()
