import type { NamespaceShape } from '../../types'

// `{lang}` is the lowercase nominative ("włoski"): sentences are phrased so it stays grammatical
// ("na {lang}" = accusative, identical for these adjectives; otherwise after a colon).
const talk: NamespaceShape<'talk'> = {
  title: 'Rozmowa',
  modes: {
    label: 'Tryb rozmowy',
    person: 'Rozmowa z osobą',
    train: 'Ćwicz z aplikacją',
  },
  person: {
    sideA: 'Twoja strona',
    sideB: 'Strona drugiej osoby',
    pair: 'Tłumaczenie: {a} i {b}',
    bridge: {
      placePhone: 'Połóż telefon na stole, między wami',
      yourTurn: 'Naciśnij „Mów” po swojej stronie',
      listeningYou: 'Słucham cię',
      listeningOther: 'Słucham drugiej osoby',
      translating: 'Tłumaczę na {lang}',
      playing: 'Odtwarzam tłumaczenie na {lang}',
    },
    sheet: {
      mine: 'Twój język',
      other: 'Język drugiej osoby',
    },
    speechUnavailable: 'To urządzenie nie ma głosu w tym języku ({lang}). Tłumaczenie zostaje na ekranie.',
  },
  train: {
    subtitle: 'Ty i aplikacja · {lang}',
    scenario: 'Scenariusz',
    scenarioAria: 'Zmień scenariusz',
    scenarioSheet: 'Wybierz scenariusz',
    scenarios: {
      cafe: { name: 'Kawiarnia', title: 'Trening w kawiarni', description: 'Zamów i zapłać przy ladzie' },
      landlord: { name: 'Właściciel mieszkania', title: 'Trening z właścicielem mieszkania', description: 'Mieszkanie, czynsz i umowa' },
      office: { name: 'Dziekanat', title: 'Trening w dziekanacie', description: 'Dokumenty i zapisy' },
    },
    log: 'Rozmowa treningowa',
    speakerYou: 'Ty',
    speakerApp: 'Aplikacja',
    translation: 'Tłumaczenie',
    states: {
      ready: { status: 'Dotknij kuli, aby zacząć', hint: 'Aplikacja zacznie rozmowę. Język: {lang}' },
      idle: { status: 'Dotknij kuli, aby mówić', hint: 'Język odpowiedzi: {lang}' },
      listening: { status: 'Słucham…', hint: 'Dotknij ponownie, gdy skończysz' },
      processing: { status: 'Myślę…', hint: 'Chwileczkę' },
      speaking: { status: 'Mówię', hint: 'Dotknij, aby przerwać' },
    },
    sphere: {
      start: 'Zacznij trening',
      speak: 'Mów do aplikacji',
      stop: 'Przestań słuchać',
      interrupt: 'Przerwij aplikację',
      wait: 'Aplikacja myśli',
    },
    controls: {
      mute: 'Wyłącz mikrofon',
      keyboard: 'Napisz wiadomość',
      reset: 'Zacznij trening od nowa',
    },
    toasts: {
      muted: 'Mikrofon wyłączony',
      keyboard: 'Tryb tekstowy już wkrótce',
    },
  },
}
export default talk
