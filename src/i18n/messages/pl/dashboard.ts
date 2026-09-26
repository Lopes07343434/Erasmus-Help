import type { NamespaceShape } from '../../types'

const dashboard: NamespaceShape<'dashboard'> = {
  greeting: 'Cześć, {name}',
  greetingNoName: 'Cześć!',
  header: {
    notifications: 'Powiadomienia',
    profile: 'Profil',
  },
  notifications: {
    none: 'Brak nowych powiadomień',
    off: 'Powiadomienia są wyłączone',
  },
  location: {
    region: 'Lokalizacja i pogoda',
    place: '{city}, {country}',
  },
  weather: {
    summary: '{condition} · {feel}',
    range: '{min} / {max}',
    refreshing: 'Aktualizowanie pogody…',
    openProfile: 'Otwórz profil',
  },
  now: {
    title: 'Czego teraz potrzebujesz?',
    talk: {
      overline: 'Rozmowa',
      title: 'Ćwicz {language} na głos',
      body: 'Prawdziwe sytuacje, bez strachu przed błędami.',
    },
    translate: {
      title: 'Tłumacz',
      subtitle: 'Mów i słuchaj tłumaczenia',
    },
    person: {
      title: 'Rozmowa z osobą',
      subtitle: 'Tłumaczenie twarzą w twarz',
    },
  },
  quick: {
    title: 'Szybkie akcje',
    emergency: 'Numer alarmowy',
    translate: 'Tłumacz',
    train: 'Trening',
    settings: 'Ustawienia',
  },
  emergency: {
    title: 'Numer alarmowy',
    body: '112 to europejski numer alarmowy. Jest bezpłatny, działa w całej UE, a w wielu krajach możesz rozmawiać po angielsku.',
    call: 'Zadzwoń pod 112',
  },
  a11y: {
    newTab: '(otwiera się w nowej karcie)',
  },
}
export default dashboard
