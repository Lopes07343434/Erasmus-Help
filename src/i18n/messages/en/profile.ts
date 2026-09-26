import type { NamespaceShape } from '../../types'

const profile: NamespaceShape<'profile'> = {
  title: 'Profile',
  identity: {
    noLocation: 'Location not set',
  },
  sections: {
    data: 'Your details',
    privacy: 'Privacy',
  },
  fields: {
    name: 'Name',
    role: 'Role',
    myLanguage: 'My language',
    country: 'Country',
    city: 'City',
    roleLocked: 'Set on your Chat account. Only an administrator can change it.',
    notSet: 'Not set',
  },
  sheets: {
    name: 'Your name',
    role: 'Your role',
    myLanguage: 'My language',
    myLanguageHint: 'Your main language. It doesn’t change the app language, which you can choose in Settings.',
    cityIn: 'City in {country}',
  },
  saved: 'Changes saved',
  privacy: {
    row: 'Privacy and data',
    title: 'Privacy and data',
    device: {
      title: 'Your data stays on this device',
      body: 'Your profile and preferences are stored only in this browser (local storage). They don’t follow you to another device, and they’re lost if you clear your browser data.',
    },
    account: {
      title: 'No accounts yet',
      body: 'In this version you don’t need to create an account or sign in, so your data isn’t kept in any account.',
    },
    audio: {
      title: 'Audio isn’t stored',
      body: 'The app doesn’t keep recordings of your voice. Speech recognition is done by your browser, which may process the audio with its provider’s speech service (for example, Google or Apple).',
    },
    services: {
      title: 'External services',
      body: 'To translate and practise, the recognised text is sent to the translation service. Weather and city search use Open-Meteo, which receives the city or coordinates, never your name.',
    },
  },
  deleteData: {
    action: 'Delete data from this device',
    title: 'Delete the data on this device?',
    body: 'We’ll delete your profile, your preferences and the cached data (weather and city searches) stored on this device. This device will stop receiving notifications.',
    warning: 'This can’t be undone. Afterwards you’ll go back to the start to set up the app again.',
    confirm: 'Delete data',
  },
}
export default profile
