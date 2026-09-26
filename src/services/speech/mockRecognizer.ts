/**
 * DEVELOPMENT-ONLY recognizer (VITE_STT_PROVIDER=mock). Does not touch the microphone: it "hears" a sample
 * phrase of the requested language word by word over ~2 s, like a real engine (lowercase, no punctuation),
 * then emits it as final. Cycles through the sample phrases on each start.
 */
import { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'
import { PRACTICE_SCRIPTS } from '../ai/mockScripts'
import { SAMPLE_PHRASES } from '../translation/mockPhrases'
import type { SpeechRecognizer } from './types'

export interface MockRecognizerOptions {
  durationMs?: number
  phrases?: Partial<Record<LanguageCode, readonly string[]>>
}

/** What a speech engine typically returns: no sentence punctuation, lowercase first letter. */
const asSpoken = (phrase: string) => {
  const bare = phrase.replace(/[.,!?¿¡…;:]/g, '').replace(/\s+/g, ' ').trim()
  return bare.charAt(0).toLowerCase() + bare.slice(1)
}

const defaultPhrases = (language: LanguageCode): string[] =>
  [...SAMPLE_PHRASES, ...PRACTICE_SCRIPTS.cafe.userLines].map((set) => asSpoken(set[language]))

export function createMockRecognizer(options: MockRecognizerOptions = {}): SpeechRecognizer {
  const durationMs = options.durationMs ?? 2000
  const counters = new Map<LanguageCode, number>()

  return {
    isSupported: () => true,

    start(opts, handlers) {
      const list = options.phrases?.[opts.language] ?? defaultPhrases(opts.language)
      const n = counters.get(opts.language) ?? 0
      counters.set(opts.language, n + 1)
      const words = (list[n % Math.max(list.length, 1)] ?? '').split(' ').filter(Boolean)
      const step = durationMs / (words.length + 1)
      const timers: ReturnType<typeof setTimeout>[] = []
      let heard = 0
      let done = false

      const clear = () => timers.forEach(clearTimeout)
      const finish = () => {
        if (done) return
        done = true
        clear()
        const text = words.slice(0, heard).join(' ')
        if (text) handlers.onFinal(text)
        else handlers.onError(new AppError('no-speech'))
        handlers.onEnd?.()
      }

      words.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            heard = i + 1
            if (opts.interimResults !== false) handlers.onPartial?.(words.slice(0, heard).join(' '))
          }, step * (i + 1)),
        )
      })
      timers.push(setTimeout(finish, durationMs))

      return {
        stop() {
          if (done) return
          clear()
          queueMicrotask(finish)
        },
        abort() {
          done = true
          clear()
        },
      }
    },
  }
}
