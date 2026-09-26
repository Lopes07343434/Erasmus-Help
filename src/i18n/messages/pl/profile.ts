import type { NamespaceShape } from '../../types'

const profile: NamespaceShape<'profile'> = {
  title: 'Profil',
  identity: {
    noLocation: 'Nie ustawiono lokalizacji',
  },
  photo: {
    add: 'Dodaj zdjęcie',
    change: 'Zmień zdjęcie',
    remove: 'Usuń zdjęcie',
    menuTitle: 'Zdjęcie profilowe',
    choose: 'Wybierz zdjęcie',
    updated: 'Zaktualizowano zdjęcie profilowe',
    removed: 'Usunięto zdjęcie profilowe',
    saving: 'Zapisywanie zdjęcia…',
    invalid: 'Nie można użyć tego obrazu. Wybierz zdjęcie JPG, PNG lub WebP.',
    unavailable: 'Zdjęcie możesz dodać po połączeniu z czatem.',
  },
  sections: {
    data: 'Twoje dane',
    privacy: 'Prywatność',
  },
  fields: {
    name: 'Imię',
    role: 'Rola',
    myLanguage: 'Mój język',
    country: 'Kraj',
    city: 'Miasto',
    roleLocked: 'Ustawiona na Twoim koncie czatu. Może ją zmienić tylko administrator.',
    notSet: 'Nie ustawiono',
  },
  sheets: {
    name: 'Twoje imię',
    role: 'Twoja rola',
    myLanguage: 'Mój język',
    myLanguageHint: 'Twój główny język. Nie zmienia języka aplikacji, który wybierzesz w Ustawieniach.',
    cityIn: 'Miasto – {country}',
  },
  saved: 'Zmiany zapisane',
  privacy: {
    row: 'Prywatność i dane',
    title: 'Prywatność i dane',
    device: {
      title: 'Dane zostają na tym urządzeniu',
      body: 'Twój profil i preferencje są zapisane tylko w tej przeglądarce (pamięć lokalna). Nie przenoszą się na inne urządzenie i znikną, jeśli wyczyścisz dane przeglądarki.',
    },
    account: {
      title: 'Konto czatu',
      body: 'Aby korzystać z czatu, aplikacja automatycznie tworzy anonimowe konto powiązane z tym urządzeniem, bez e-maila i hasła. Twoje imię, rola, ID i zdjęcie są widoczne dla osób korzystających z czatu, a wiadomości tylko dla uczestników danej rozmowy.',
    },
    audio: {
      title: 'Nagrania nie są zapisywane',
      body: 'Aplikacja nie przechowuje nagrań Twojego głosu. Rozpoznawanie mowy wykonuje przeglądarka, która może przetwarzać dźwięk w usłudze mowy swojego dostawcy (np. Google lub Apple).',
    },
    services: {
      title: 'Usługi zewnętrzne',
      body: 'Aby tłumaczyć i ćwiczyć, rozpoznany tekst jest wysyłany do usługi tłumaczenia. Pogoda i wyszukiwanie miast korzystają z Open-Meteo, które otrzymuje miasto lub współrzędne, nigdy Twoje imię.',
    },
  },
  deleteData: {
    action: 'Usuń dane z tego urządzenia',
    title: 'Usunąć dane z tego urządzenia?',
    body: 'Usuniemy Twój profil, preferencje i dane w pamięci podręcznej (pogoda i wyszukiwania miast) zapisane na tym urządzeniu. To urządzenie przestanie otrzymywać powiadomienia.',
    warning: 'Tej operacji nie można cofnąć. Następnie wrócisz do początku, aby ponownie skonfigurować aplikację.',
    confirm: 'Usuń dane',
  },
}
export default profile
