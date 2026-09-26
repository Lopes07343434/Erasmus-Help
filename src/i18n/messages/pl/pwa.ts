import type { NamespaceShape } from '../../types'

const pwa: NamespaceShape<'pwa'> = {
  update: {
    title: 'Dostępna jest nowa wersja',
    body: 'Zaktualizuj, aby korzystać z najnowszej wersji aplikacji.',
    action: 'Aktualizuj',
    later: 'Później',
  },
  offlineReady: {
    title: 'Gotowa do użycia offline',
    body: 'Aplikacja otworzy się nawet bez połączenia. Tłumaczenie, rozmowa z AI i pogoda wymagają internetu.',
  },
  install: {
    title: 'Zainstaluj aplikację',
    body: 'Dodaj Erasmus Help do ekranu głównego: uruchamia się szybciej, na pełnym ekranie i działa nawet bez połączenia.',
    action: 'Zainstaluj',
    installed: 'Aplikacja jest zainstalowana na tym urządzeniu.',
    steps: {
      ios: {
        title: 'Instalacja na iPhonie lub iPadzie',
        step1: 'Otwórz tę stronę w Safari.',
        step2: 'Stuknij Udostępnij (kwadrat ze strzałką w górę).',
        step3: 'Wybierz „Do ekranu początkowego” i stuknij „Dodaj”.',
      },
      android: {
        title: 'Instalacja na Androidzie',
        step1: 'Otwórz tę stronę w Chrome.',
        step2: 'Stuknij menu ⋮ w prawym górnym rogu.',
        step3: 'Wybierz „Zainstaluj aplikację” (lub „Dodaj do ekranu głównego”) i potwierdź.',
      },
      desktop: {
        title: 'Instalacja na komputerze',
        step1: 'Otwórz tę stronę w Chrome lub Edge.',
        step2: 'Kliknij ikonę instalacji na pasku adresu.',
        step3: 'Potwierdź, klikając „Zainstaluj”.',
      },
      other: {
        title: 'Instalacja aplikacji',
        step1: 'Otwórz menu przeglądarki.',
        step2: 'Wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.',
        step3: 'Potwierdź instalację.',
      },
    },
    safariMac: 'W Safari (Mac): Plik → Dodaj do Docka.',
  },
  notifications: {
    title: 'Powiadomienia',
    ask: {
      title: 'Chcesz otrzymywać powiadomienia?',
      body: 'Poinformujemy Cię o ważnych nowościach w aplikacji, nawet gdy jest zamknięta. Możesz to zmienić w każdej chwili w Ustawieniach.',
      hint: 'Przeglądarka poprosi Cię o zgodę.',
      allow: 'Włącz powiadomienia',
      decline: 'Nie teraz',
    },
    states: {
      granted: {
        title: 'Powiadomienia włączone',
        body: 'To urządzenie może otrzymywać powiadomienia z Erasmus Help.',
      },
      default: {
        title: 'Powiadomienia wyłączone',
        body: 'Nie zezwolono jeszcze na powiadomienia na tym urządzeniu.',
      },
      denied: {
        title: 'Powiadomienia zablokowane',
        body: 'Powiadomienia dla tej aplikacji są zablokowane. Możesz je ponownie włączyć tylko w ustawieniach przeglądarki lub systemu.',
      },
      unsupported: {
        title: 'Powiadomienia niedostępne',
        body: 'Ta przeglądarka nie obsługuje powiadomień.',
      },
    },
    iosInstallRequired:
      'Na iPhonie i iPadzie powiadomienia działają tylko wtedy, gdy aplikacja jest dodana do ekranu początkowego (iOS 16.4 lub nowszy).',
    pushUnavailable: 'Wysyłanie powiadomień nie jest jeszcze aktywne w tej wersji aplikacji.',
    reenable: {
      title: 'Jak je ponownie włączyć',
      ios: 'iPhone/iPad: Ustawienia → Powiadomienia → Erasmus Help → włącz „Pozwalaj na powiadomienia”.',
      android:
        'Android: w Chrome stuknij ikonę po lewej stronie adresu → Uprawnienia → Powiadomienia → Zezwalaj. Jeśli aplikacja jest zainstalowana: przytrzymaj jej ikonę → Informacje o aplikacji → Powiadomienia.',
      desktop:
        'Komputer: kliknij ikonę po lewej stronie adresu → Ustawienia witryny → Powiadomienia → Zezwalaj, a następnie odśwież stronę.',
      other: 'Otwórz ustawienia tej witryny w przeglądarce i zezwól na powiadomienia.',
    },
  },
}
export default pwa
