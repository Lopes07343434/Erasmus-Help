import type { NamespaceShape } from '../../types'

const onboarding: NamespaceShape<'onboarding'> = {
  splash: {
    label: 'Erasmus Help. Tap to continue.',
  },
  intro: {
    skip: 'Skip intro',
    progress: 'Screen {current} of {total}',
    slides: {
      welcome: {
        title: 'Welcome to Erasmus Help',
        body: 'Translate, practise and find your way around your Erasmus city. All in one place.',
      },
      translate: {
        title: 'Speak. We translate.',
        body: 'Record your voice, check the recognised text and hear the corrected translation in seconds.',
      },
      practice: {
        title: 'Practise without fear',
        body: 'Talk out loud with the app in real situations: at the café, when renting a room, at the university office.',
      },
    },
    example: {
      recognized: 'Recognised · {language}',
      translation: 'Translation · {language}',
      source: 'Where is the nearest station?',
      target: 'Dov’è la stazione più vicina?',
      corrected: 'Corrected',
    },
  },
  progress: 'Step {current} of {total}',
  name: {
    title: 'What’s your name?',
    body: 'This is how the app will address you.',
    label: 'Name',
    placeholder: 'Your name',
    errors: {
      empty: 'Please enter your name.',
      tooLong: 'Your name can be at most {max} characters long.',
      invalid: 'Use only letters, spaces, apostrophes, full stops or hyphens.',
    },
  },
  role: {
    title: 'What’s your role?',
    body: 'Choose the option that best describes you.',
    descriptions: {
      student: 'I’m on Erasmus and want support day to day.',
      monitor: 'I guide and support Erasmus students.',
    },
  },
  language: {
    title: 'What’s your main language?',
    body: 'The app switches to this language straight away. You can change the app language any time in Settings.',
  },
  location: {
    title: 'Where will you be?',
    body: 'We use your city to show the local weather and suggest a conversation language.',
    country: {
      label: 'Country',
      placeholder: 'Choose a country',
      sheetTitle: 'Country',
      search: 'Search countries',
      emptyTitle: 'No countries found',
      emptyBody: 'Try typing the name another way.',
    },
    city: {
      label: 'City',
      placeholder: 'Type the city name',
      needsCountry: 'Choose a country first.',
      hint: 'Type at least {min} letters.',
      searching: 'Searching for cities…',
      results: 'Matching cities',
      empty: 'We couldn’t find that city in {country}. Check the name and try again.',
      offline: 'You’re offline, so we can’t search for cities. You can continue with the name you typed.',
      error: 'City search isn’t available right now. You can continue with the name you typed.',
      useTyped: 'Use “{city}”',
      selected: 'Selected city: {city}',
      typedSelected: 'We’ll save “{city}”. The weather will appear once you’re online.',
    },
  },
  notifications: {
    title: 'Do you want notifications?',
    body: 'We’ll use them to let you know about messages and important updates, even when the app is closed. You can change this any time in Settings.',
    allow: 'Allow notifications',
    dismissed: 'You didn’t give permission. You can turn notifications on later in Settings.',
  },
}
export default onboarding
