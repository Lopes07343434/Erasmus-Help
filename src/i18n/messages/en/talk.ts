import type { NamespaceShape } from '../../types'

const talk: NamespaceShape<'talk'> = {
  title: 'Talk',
  modes: {
    label: 'Conversation mode',
    person: 'Talk with someone',
    train: 'Practise with the app',
  },
  person: {
    sideA: 'Your side',
    sideB: "The other person's side",
    pair: 'Translating between {a} and {b}',
    bridge: {
      placePhone: 'Put the phone on the table, between you both',
      yourTurn: 'Tap Speak on your side',
      listeningYou: 'Listening to you',
      listeningOther: 'Listening to the other person',
      translating: 'Translating into {lang}',
      playing: 'Playing in {lang}',
    },
    sheet: {
      mine: 'Your language',
      other: "The other person's language",
    },
    speechUnavailable: "There's no {lang} voice on this device. The translation stays on screen.",
  },
  train: {
    subtitle: 'You and the app · {lang}',
    scenario: 'Scenario',
    scenarioAria: 'Change scenario',
    scenarioSheet: 'Choose a scenario',
    scenarios: {
      cafe: { name: 'Café', title: 'Practice at the café', description: 'Order and pay at the counter' },
      landlord: { name: 'Landlord', title: 'Practice with the landlord', description: 'Flat, rent and contract' },
      office: { name: 'University office', title: 'Practice at the university office', description: 'Documents and enrolment' },
    },
    log: 'Practice conversation',
    speakerYou: 'You',
    speakerApp: 'App',
    translation: 'Translation',
    states: {
      ready: { status: 'Tap the sphere to start', hint: 'The app opens the conversation in {lang}' },
      idle: { status: 'Tap the sphere to speak', hint: 'Answer in {lang}' },
      listening: { status: 'Listening…', hint: "Tap again when you're done" },
      processing: { status: 'Thinking…', hint: 'One moment' },
      speaking: { status: 'Speaking', hint: 'Tap to interrupt' },
    },
    sphere: {
      start: 'Start practising',
      speak: 'Talk to the app',
      stop: 'Stop listening',
      interrupt: 'Interrupt the app',
      wait: 'The app is thinking',
    },
    controls: {
      mute: 'Turn off microphone',
      keyboard: 'Type a message',
      reset: 'Restart practice',
    },
    toasts: {
      muted: 'Microphone off',
      keyboard: 'Text mode coming soon',
    },
  },
}
export default talk
