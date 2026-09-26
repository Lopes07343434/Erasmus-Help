import { env } from '@/config/env'
import { AppError } from '../errors'
import type { RecognitionSession, SpeechRecognizer, SpeechSynthesizer } from './types'
import { webSpeechRecognizer } from './webSpeechRecognizer'
import { webSpeechSynthesizer } from './webSpeechSynthesizer'

export type * from './types'
export { listen, DEFAULT_MAX_LISTEN_MS, type ListenHandle, type ListenOptions } from './listen'
export { getMicrophonePermission, type MicrophonePermission } from './microphone'

const unavailableRecognizer: SpeechRecognizer = {
  isSupported: () => false,
  start(_opts, handlers) {
    queueMicrotask(() => {
      handlers.onError(new AppError('not-configured'))
      handlers.onEnd?.()
    })
    return { stop() {}, abort() {} }
  },
}

const unavailableSynthesizer: SpeechSynthesizer = {
  isSupported: () => false,
  speak(_text, _language, handlers) {
    queueMicrotask(() => handlers?.onError?.(new AppError('not-configured')))
    return { cancel() {} }
  },
}

/** Loads a recognizer module on first use (keeps dev-only mocks out of production chunks). */
function lazyRecognizer(load: () => Promise<SpeechRecognizer>): SpeechRecognizer {
  let loading: Promise<SpeechRecognizer> | null = null
  return {
    isSupported: () => true,
    start(opts, handlers) {
      let inner: RecognitionSession | null = null
      let pending: 'none' | 'stop' | 'abort' = 'none'
      loading ??= load()
      loading.then(
        (recognizer) => {
          if (pending === 'abort') return
          inner = recognizer.start(opts, handlers)
          if (pending === 'stop') inner.stop()
        },
        (err: unknown) => {
          if (pending === 'abort') return
          handlers.onError(new AppError('unavailable', err))
          handlers.onEnd?.()
        },
      )
      return {
        stop() {
          if (inner) inner.stop()
          else if (pending === 'none') pending = 'stop'
        },
        abort() {
          if (inner) inner.abort()
          else pending = 'abort'
        },
      }
    },
  }
}

function createRecognizer(): SpeechRecognizer {
  switch (env.sttProvider) {
    case 'browser':
      return webSpeechRecognizer
    case 'mock':
      // `import.meta.env.DEV` is statically false in production builds → the mock is tree-shaken away.
      return import.meta.env.DEV ? lazyRecognizer(() => import('./mockRecognizer').then((m) => m.createMockRecognizer())) : unavailableRecognizer
    case 'none':
      return unavailableRecognizer
  }
}

let recognizer: SpeechRecognizer | null = null
let synthesizer: SpeechSynthesizer | null = null

/** Speech-to-text provider selected by VITE_STT_PROVIDER. */
export function getRecognizer(): SpeechRecognizer {
  recognizer ??= createRecognizer()
  return recognizer
}

/** Text-to-speech provider selected by VITE_TTS_PROVIDER. */
export function getSynthesizer(): SpeechSynthesizer {
  synthesizer ??= env.ttsProvider === 'browser' ? webSpeechSynthesizer : unavailableSynthesizer
  return synthesizer
}
