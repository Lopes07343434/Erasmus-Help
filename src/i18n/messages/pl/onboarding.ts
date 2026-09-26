import type { NamespaceShape } from '../../types'

const onboarding: NamespaceShape<'onboarding'> = {
  splash: {
    label: 'Erasmus Help. Stuknij, aby kontynuować.',
  },
  intro: {
    skip: 'Pomiń wprowadzenie',
    progress: 'Ekran {current} z {total}',
    slides: {
      welcome: {
        title: 'Witamy w Erasmus Help',
        body: 'Tłumacz, ćwicz i odnajdź się w swoim mieście na Erasmusie. Wszystko w jednym miejscu.',
      },
      translate: {
        title: 'Mów. My przetłumaczymy.',
        body: 'Nagraj swój głos, sprawdź rozpoznany tekst i w kilka sekund posłuchaj poprawionego tłumaczenia.',
      },
      practice: {
        title: 'Ćwicz bez stresu',
        body: 'Rozmawiaj na głos z aplikacją w prawdziwych sytuacjach: w kawiarni, przy wynajmie mieszkania, w dziekanacie.',
      },
    },
    example: {
      recognized: 'Rozpoznano · {language}',
      translation: 'Tłumaczenie · {language}',
      source: 'Gdzie jest najbliższa stacja?',
      target: 'Dov’è la stazione più vicina?',
      corrected: 'Poprawiono',
    },
  },
  progress: 'Krok {current} z {total}',
  name: {
    title: 'Jak masz na imię?',
    body: 'Tak aplikacja będzie się do Ciebie zwracać.',
    label: 'Imię',
    placeholder: 'Twoje imię',
    errors: {
      empty: 'Wpisz swoje imię.',
      tooLong: 'Imię może mieć maksymalnie {max} znaków.',
      invalid: 'Używaj tylko liter, spacji, apostrofów, kropek i łączników.',
    },
  },
  role: {
    title: 'Jaka jest Twoja rola?',
    body: 'Wybierz opcję, która najlepiej Cię opisuje.',
    descriptions: {
      student: 'Jestem na Erasmusie i potrzebuję wsparcia na co dzień.',
      monitor: 'Wspieram studentów Erasmusa i pomagam im.',
    },
  },
  language: {
    title: 'Jaki jest Twój główny język?',
    body: 'Aplikacja od razu przełączy się na ten język. Język aplikacji możesz zmienić w każdej chwili w Ustawieniach.',
  },
  location: {
    title: 'Gdzie spędzisz Erasmusa?',
    body: 'Na podstawie miasta pokażemy lokalną pogodę i zaproponujemy język rozmowy.',
    country: {
      label: 'Kraj',
      placeholder: 'Wybierz kraj',
      sheetTitle: 'Kraj',
      search: 'Szukaj kraju',
      emptyTitle: 'Nie znaleziono kraju',
      emptyBody: 'Spróbuj wpisać nazwę inaczej.',
    },
    city: {
      label: 'Miasto',
      placeholder: 'Wpisz nazwę miasta',
      needsCountry: 'Najpierw wybierz kraj.',
      hint: 'Wpisz co najmniej {min} litery.',
      searching: 'Szukamy miast…',
      results: 'Znalezione miasta',
      empty: 'Nie znaleźliśmy takiego miasta ({country}). Sprawdź nazwę i spróbuj ponownie.',
      offline: 'Brak połączenia, więc nie możemy wyszukać miast. Możesz kontynuować z wpisaną nazwą.',
      error: 'Wyszukiwanie miast jest teraz niedostępne. Możesz kontynuować z wpisaną nazwą.',
      useTyped: 'Użyj „{city}”',
      selected: 'Wybrane miasto: {city}',
      typedSelected: 'Zapiszemy „{city}”. Pogoda pojawi się, gdy połączenie wróci.',
    },
  },
  notifications: {
    title: 'Chcesz otrzymywać powiadomienia?',
    body: 'Dzięki nim poinformujemy Cię o wiadomościach i ważnych nowościach, nawet gdy aplikacja jest zamknięta. Możesz to zmienić w każdej chwili w Ustawieniach.',
    allow: 'Zezwól na powiadomienia',
    dismissed: 'Nie udzielono zgody. Powiadomienia możesz włączyć później w Ustawieniach.',
  },
}
export default onboarding
