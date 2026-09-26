import type { NamespaceShape } from '../../types'

const settings: NamespaceShape<'settings'> = {
  title: 'Settings',
  sections: {
    appearance: 'Appearance',
    languages: 'Languages',
    notifications: 'Notifications',
    app: 'App',
  },
  appearance: {
    darkMode: 'Dark mode',
  },
  languages: {
    app: 'App language',
    conversation: 'Conversation language',
    caption: 'The app language changes menus and texts. The conversation language is the one the Translator translates into and the one you practise in Talk.',
    appSheetHint: 'Menus and texts change straight away.',
    conversationSheetHint: 'Target language for the Translator and for practising in Talk.',
  },
  notifications: {
    label: 'Notifications',
    on: 'On for this device.',
    off: 'Alerts about messages and important updates.',
    requesting: 'Answer your browser’s prompt…',
    enabledToast: 'Notifications turned on',
    deniedToast: 'Notifications are blocked in your browser.',
    dismissedToast: 'Permission wasn’t given.',
    pushError: 'We couldn’t turn on notification delivery right now. Try again later.',
  },
  app: {
    installHint: 'Opens faster, full screen, and works offline.',
    installedToast: 'App installed',
    about: 'About Erasmus Help',
    aboutTitle: 'About',
    version: 'Version {version}',
    replayIntro: 'Replay the intro',
  },
}
export default settings
