import type { NamespaceShape } from '../../types'

const translate: NamespaceShape<'translate'> = {
  title: 'Tłumacz',
  subtitle: 'Mów naturalnie. Resztą zajmiemy się my.',
  languages: {
    source: 'Język źródłowy',
    target: 'Język docelowy',
    sourceButton: 'Język źródłowy: {language}',
    targetButton: 'Język docelowy: {language}',
    swap: 'Zamień języki',
  },
  recognized: {
    label: 'Rozpoznano · {language}',
    listening: 'Słucham…',
    original: 'Oryginał: {text}',
    hint: {
      'pt-PT': 'Dotknij mikrofonu i mów po portugalsku.',
      en: 'Dotknij mikrofonu i mów po angielsku.',
      pl: 'Dotknij mikrofonu i mów po polsku.',
      es: 'Dotknij mikrofonu i mów po hiszpańsku.',
      fr: 'Dotknij mikrofonu i mów po francusku.',
      de: 'Dotknij mikrofonu i mów po niemiecku.',
      it: 'Dotknij mikrofonu i mów po włosku.',
    },
  },
  result: {
    label: 'Tłumaczenie · {language}',
    empty: 'Tutaj pojawi się tłumaczenie.',
    corrected: 'Poprawiono: {changes}',
    listen: 'Odsłuchaj',
    playing: 'Odtwarzam…',
    copy: 'Kopiuj tłumaczenie',
    speechUnavailable: 'Czytanie na głos nie jest dostępne w tej przeglądarce.',
  },
  corrections: {
    punctuation: 'interpunkcja',
    accents: 'znaki diakrytyczne',
    capitalization: 'wielkie litery',
    spelling: 'pisownia',
    grammar: 'gramatyka',
  },
  steps: {
    listening: 'Słucham',
    processing: 'Przetwarzam',
    translating: 'Tłumaczę',
    done: 'Gotowe',
    progress: 'Krok {step} z {total}: {label}',
  },
  mic: {
    idle: 'Dotknij, aby mówić',
    listening: 'Dotknij, aby zakończyć',
    processing: 'Przetwarzam…',
    translating: 'Tłumaczę…',
    done: 'Mów ponownie',
    error: 'Dotknij, aby spróbować ponownie',
  },
  toast: {
    copied: 'Skopiowano tłumaczenie',
    copyFailed: 'Nie udało się skopiować tłumaczenia',
    speechFailed: 'Nie udało się odtworzyć tłumaczenia',
    speechUnsupported: 'Czytanie na głos nie jest dostępne w tej przeglądarce',
  },
  errorHints: {
    permissionDenied:
      'Tłumacz potrzebuje mikrofonu. Zezwól na dostęp do mikrofonu w ustawieniach przeglądarki (zwykle ikona kłódki obok adresu) i ponownie dotknij mikrofonu.',
    notSupported: 'Ta przeglądarka nie rozpoznaje mowy. Otwórz Erasmus Help w Chrome, Edge lub Safari, aby korzystać z tłumacza.',
    noSpeech: 'Nie wychwyciliśmy żadnej wypowiedzi. Mów blisko mikrofonu, najlepiej w cichym miejscu, i spróbuj ponownie.',
    notConfigured: 'Usługa tłumaczenia nie jest jeszcze dostępna w tej wersji aplikacji.',
    offline: 'Tłumacz potrzebuje internetu, aby rozpoznać i przetłumaczyć Twoją wypowiedź. Sprawdź połączenie i ponownie dotknij mikrofonu.',
    timeout: 'Usługa tłumaczenia zbyt długo nie odpowiadała. Dotknij mikrofonu, aby spróbować ponownie.',
    unavailable: 'Nie udało się połączyć z usługą tłumaczenia. Spróbuj ponownie za chwilę.',
    rateLimited: 'Wykonano wiele tłumaczeń z rzędu. Poczekaj chwilę i spróbuj ponownie.',
  },
}
export default translate
