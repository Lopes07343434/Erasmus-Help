import type { NamespaceShape } from '../../types'

const translate: NamespaceShape<'translate'> = {
  title: 'Translator',
  subtitle: 'Speak naturally. We’ll handle the rest.',
  languages: {
    source: 'Source language',
    target: 'Target language',
    sourceButton: 'Source language: {language}',
    targetButton: 'Target language: {language}',
    swap: 'Swap languages',
  },
  recognized: {
    label: 'Recognised · {language}',
    listening: 'Listening…',
    original: 'Original: {text}',
    hint: {
      'pt-PT': 'Tap the microphone and speak Portuguese.',
      en: 'Tap the microphone and speak English.',
      pl: 'Tap the microphone and speak Polish.',
      es: 'Tap the microphone and speak Spanish.',
      fr: 'Tap the microphone and speak French.',
      de: 'Tap the microphone and speak German.',
      it: 'Tap the microphone and speak Italian.',
    },
  },
  result: {
    label: 'Translation · {language}',
    empty: 'The translation will appear here.',
    corrected: 'Corrected: {changes}',
    listen: 'Listen',
    playing: 'Playing…',
    copy: 'Copy translation',
    speechUnavailable: 'Reading aloud isn’t available in this browser.',
  },
  corrections: {
    punctuation: 'punctuation',
    accents: 'accents',
    capitalization: 'capitalisation',
    spelling: 'spelling',
    grammar: 'grammar',
  },
  steps: {
    listening: 'Listening',
    processing: 'Processing',
    translating: 'Translating',
    done: 'Done',
    progress: 'Step {step} of {total}: {label}',
  },
  mic: {
    idle: 'Tap to speak',
    listening: 'Tap to stop',
    processing: 'Processing…',
    translating: 'Translating…',
    done: 'Speak again',
    error: 'Tap to try again',
  },
  toast: {
    copied: 'Translation copied',
    copyFailed: 'Couldn’t copy the translation',
    speechFailed: 'Couldn’t play the translation',
    speechUnsupported: 'Reading aloud isn’t available in this browser',
  },
  errorHints: {
    permissionDenied:
      'The Translator needs your microphone. Allow microphone access in your browser settings (usually the padlock icon next to the address) and tap the microphone again.',
    notSupported: 'This browser can’t recognise speech. Open Erasmus Help in Chrome, Edge or Safari to use the Translator.',
    noSpeech: 'We didn’t catch any speech. Speak close to the microphone, ideally somewhere quiet, and tap to try again.',
    notConfigured: 'The translation service isn’t available in this version of the app yet.',
    offline: 'The Translator needs the internet to recognise and translate your voice. Check your connection and tap the microphone to try again.',
    timeout: 'The translation service took too long to respond. Tap the microphone to try again.',
    unavailable: 'We couldn’t reach the translation service. Try again in a moment.',
    rateLimited: 'You’ve made a lot of translations in a row. Wait a moment and try again.',
  },
}
export default translate
