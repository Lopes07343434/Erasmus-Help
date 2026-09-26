import type { NamespaceShape } from '../../types'

const dashboard: NamespaceShape<'dashboard'> = {
  greeting: 'Hi, {name}',
  greetingNoName: 'Hi!',
  header: {
    notifications: 'Notifications',
    profile: 'Profile',
  },
  notifications: {
    none: 'No new notifications',
    off: 'Notifications are turned off',
  },
  location: {
    region: 'Location and weather',
    place: '{city}, {country}',
  },
  weather: {
    summary: '{condition} · {feel}',
    range: '{min} / {max}',
    refreshing: 'Updating the weather…',
    openProfile: 'Open profile',
  },
  now: {
    title: 'What do you need right now?',
    talk: {
      overline: 'Talk',
      title: 'Practise {language} out loud',
      body: 'Real situations, no fear of mistakes.',
    },
    translate: {
      title: 'Translator',
      subtitle: 'Speak and hear the translation',
    },
    person: {
      title: 'Talk with someone',
      subtitle: 'Face-to-face translation',
    },
  },
  quick: {
    title: 'Quick actions',
    emergency: 'Emergency',
    translate: 'Translator',
    train: 'Practice',
    settings: 'Settings',
  },
  emergency: {
    title: 'Emergency',
    body: '112 is the European emergency number. It’s free, works across the EU and, in many countries, you can speak English.',
    call: 'Call 112',
  },
  a11y: {
    newTab: '(opens in a new tab)',
  },
}
export default dashboard
