import type { NamespaceShape } from '../../types'

const pwa: NamespaceShape<'pwa'> = {
  update: {
    title: 'New version available',
    body: 'Update to get the latest version of the app.',
    action: 'Update',
    later: 'Later',
  },
  offlineReady: {
    title: 'Ready to use offline',
    body: 'The app opens even without a connection. Translation, AI conversation and weather need the internet.',
  },
  install: {
    title: 'Install the app',
    body: 'Add Erasmus Help to your home screen: it opens faster, full screen, and works even without a connection.',
    action: 'Install',
    installed: 'The app is installed on this device.',
    steps: {
      ios: {
        title: 'Install on iPhone or iPad',
        step1: 'Open this page in Safari.',
        step2: 'Tap Share (the square with an upward arrow).',
        step3: 'Choose “Add to Home Screen” and tap “Add”.',
      },
      android: {
        title: 'Install on Android',
        step1: 'Open this page in Chrome.',
        step2: 'Tap the ⋮ menu in the top-right corner.',
        step3: 'Choose “Install app” (or “Add to Home screen”) and confirm.',
      },
      desktop: {
        title: 'Install on your computer',
        step1: 'Open this page in Chrome or Edge.',
        step2: 'Click the install icon in the address bar.',
        step3: 'Confirm with “Install”.',
      },
      other: {
        title: 'Install the app',
        step1: 'Open your browser menu.',
        step2: 'Choose “Install app” or “Add to Home screen”.',
        step3: 'Confirm the installation.',
      },
    },
    safariMac: 'In Safari (Mac): File → Add to Dock.',
  },
  notifications: {
    title: 'Notifications',
    ask: {
      title: 'Would you like notifications?',
      body: 'We’ll let you know about important updates from the app, even when it’s closed. You can change this anytime in Settings.',
      hint: 'Your browser will ask for your permission.',
      allow: 'Turn on notifications',
      decline: 'Not now',
    },
    states: {
      granted: {
        title: 'Notifications on',
        body: 'This device can receive notifications from Erasmus Help.',
      },
      default: {
        title: 'Notifications off',
        body: 'You haven’t allowed notifications on this device yet.',
      },
      denied: {
        title: 'Notifications blocked',
        body: 'Notifications are blocked for this app. You can only turn them back on in your browser or system settings.',
      },
      unsupported: {
        title: 'Notifications unavailable',
        body: 'This browser doesn’t support notifications.',
      },
    },
    iosInstallRequired:
      'On iPhone and iPad, notifications only work when the app is added to your Home Screen (iOS 16.4 or later).',
    pushUnavailable: 'Sending notifications isn’t active yet in this version of the app.',
    reenable: {
      title: 'How to turn them back on',
      ios: 'iPhone/iPad: Settings → Notifications → Erasmus Help → turn on “Allow Notifications”.',
      android:
        'Android: in Chrome, tap the icon to the left of the address → Permissions → Notifications → Allow. If the app is installed: long-press its icon → App info → Notifications.',
      desktop:
        'Computer: click the icon to the left of the address → Site settings → Notifications → Allow, then reload the page.',
      other: 'Open this site’s settings in your browser and allow notifications.',
    },
  },
}
export default pwa
