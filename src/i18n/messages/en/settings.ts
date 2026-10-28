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
  },
  permissions: {
    title: 'Permissions',
    back: 'Back to settings',
    intro: 'See and turn on what Erasmus Help needs on this device. We only ask for permission when you tap a button.',
    rowLabel: 'Permissions',
    rowHint: 'Notifications and microphone',
    status: {
      granted: 'On',
      off: 'Off',
      blocked: 'Blocked',
      unavailable: 'Unavailable',
    },
    sections: {
      notifications: 'Notifications',
      microphone: 'Microphone',
    },
    notifications: {
      description: 'Alerts for messages and important news, even when the app is closed.',
      allow: 'Turn on notifications',
    },
    push: {
      title: 'Receive when the app is closed',
      active: 'This device receives push notifications, even when the app is closed.',
      inactive: 'Turn on notifications to get alerts even when the app is closed.',
      pending: 'Turning on push notifications on this device…',
      failed: 'Push notifications could not be turned on right now. Check your connection and try again.',
      retry: 'Try again',
      test: 'Send a test notification',
      testSent: 'Sent! It should show up in a moment.',
      testNone: 'This device is not registered yet. Try again in a moment.',
      testWait: 'Wait a few seconds before testing again.',
      testError: 'The test could not be sent right now.',
    },
    microphone: {
      description: 'Used in the Translator, in Talk and in Chat voice messages.',
      allow: 'Allow microphone',
      granted: 'The microphone is available.',
      denied: 'The microphone is blocked. You can only allow it again in your browser or system settings.',
      unsupported: 'This browser does not allow using the microphone.',
      failed: 'Could not connect to the microphone.',
      reenable: "Open this site's settings in your browser (icon to the left of the address) → Permissions → Microphone → Allow.",
    },
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
