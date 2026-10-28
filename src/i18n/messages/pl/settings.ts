import type { NamespaceShape } from '../../types'

const settings: NamespaceShape<'settings'> = {
  title: 'Ustawienia',
  sections: {
    appearance: 'Wygląd',
    languages: 'Języki',
    notifications: 'Powiadomienia',
    app: 'Aplikacja',
  },
  appearance: {
    darkMode: 'Tryb ciemny',
  },
  languages: {
    app: 'Język aplikacji',
    conversation: 'Język rozmowy',
    caption: 'Język aplikacji zmienia menu i teksty. Język rozmowy to język, na który tłumaczy Tłumacz i w którym ćwiczysz w zakładce Rozmowa.',
    appSheetHint: 'Menu i teksty zmienią się od razu.',
    conversationSheetHint: 'Język docelowy Tłumacza i ćwiczeń w zakładce Rozmowa.',
  },
  notifications: {
    label: 'Powiadomienia',
    on: 'Włączone na tym urządzeniu.',
    off: 'Informacje o wiadomościach i ważnych nowościach.',
    requesting: 'Odpowiedz na pytanie przeglądarki…',
    enabledToast: 'Powiadomienia włączone',
    deniedToast: 'Powiadomienia są zablokowane w przeglądarce.',
    dismissedToast: 'Nie udzielono zgody.',
  },
  permissions: {
    title: 'Uprawnienia',
    back: 'Wróć do ustawień',
    intro: 'Sprawdź i włącz to, czego Erasmus Help potrzebuje na tym urządzeniu. Prosimy o zgodę tylko wtedy, gdy dotkniesz przycisku.',
    rowLabel: 'Uprawnienia',
    rowHint: 'Powiadomienia i mikrofon',
    status: {
      granted: 'Włączone',
      off: 'Wyłączone',
      blocked: 'Zablokowane',
      unavailable: 'Niedostępne',
    },
    sections: {
      notifications: 'Powiadomienia',
      microphone: 'Mikrofon',
    },
    notifications: {
      description: 'Informacje o wiadomościach i ważnych nowościach, także przy zamkniętej aplikacji.',
      allow: 'Włącz powiadomienia',
    },
    push: {
      title: 'Odbieranie przy zamkniętej aplikacji',
      active: 'To urządzenie otrzymuje powiadomienia push, nawet gdy aplikacja jest zamknięta.',
      inactive: 'Włącz powiadomienia, aby otrzymywać alerty także przy zamkniętej aplikacji.',
      pending: 'Włączanie powiadomień push na tym urządzeniu…',
      failed: 'Nie udało się teraz włączyć powiadomień push. Sprawdź połączenie i spróbuj ponownie.',
      retry: 'Spróbuj ponownie',
      test: 'Wyślij powiadomienie testowe',
      testSent: 'Wysłano! Powinno pojawić się za chwilę.',
      testNone: 'To urządzenie nie jest jeszcze zarejestrowane. Spróbuj za chwilę.',
      testWait: 'Poczekaj kilka sekund przed kolejnym testem.',
      testError: 'Nie udało się teraz wysłać testu.',
    },
    microphone: {
      description: 'Używany w Tłumaczu, w Rozmowie i w wiadomościach głosowych na czacie.',
      allow: 'Zezwól na mikrofon',
      granted: 'Mikrofon jest dostępny.',
      denied: 'Mikrofon jest zablokowany. Możesz go ponownie włączyć tylko w ustawieniach przeglądarki lub systemu.',
      unsupported: 'Ta przeglądarka nie pozwala na użycie mikrofonu.',
      failed: 'Nie udało się połączyć z mikrofonem.',
      reenable: 'Otwórz ustawienia tej witryny w przeglądarce (ikona obok adresu) → Uprawnienia → Mikrofon → Zezwól.',
    },
  },
  app: {
    installHint: 'Uruchamia się szybciej, na pełnym ekranie i działa offline.',
    installedToast: 'Aplikacja zainstalowana',
    about: 'O Erasmus Help',
    aboutTitle: 'O aplikacji',
    version: 'Wersja {version}',
    replayIntro: 'Obejrzyj wprowadzenie ponownie',
  },
}
export default settings
