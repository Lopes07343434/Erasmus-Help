import type { NamespaceShape } from '../../types'

const errors: NamespaceShape<'errors'> = {
  offline: { title: 'Brak połączenia z internetem', body: 'Sprawdź połączenie i spróbuj ponownie.' },
  timeout: { title: 'To trwa zbyt długo', body: 'Usługa nie odpowiedziała na czas. Spróbuj ponownie.' },
  unavailable: { title: 'Usługa niedostępna', body: 'Nie udało się połączyć z usługą. Spróbuj za chwilę.' },
  notConfigured: { title: 'Jeszcze niedostępne', body: 'Ta funkcja nie jest jeszcze włączona w tej wersji.' },
  notSupported: { title: 'Nieobsługiwane na tym urządzeniu', body: 'Twoja przeglądarka nie obsługuje tej funkcji. Spróbuj Chrome, Edge lub Safari.' },
  permissionDenied: { title: 'Odmowa uprawnień', body: 'Zezwól na dostęp w ustawieniach przeglądarki, aby kontynuować.' },
  noSpeech: { title: 'Nic nie usłyszeliśmy', body: 'Mów trochę bliżej mikrofonu i spróbuj ponownie.' },
  invalidInput: { title: 'Nieprawidłowe dane', body: 'Sprawdź wprowadzone dane.' },
  notFound: { title: 'Nie znaleziono', body: 'Nie znaleźliśmy tego, czego szukasz.' },
  rateLimited: { title: 'Zbyt wiele żądań', body: 'Poczekaj chwilę i spróbuj ponownie.' },
  aborted: { title: 'Anulowano', body: 'Operacja została anulowana.' },
  unknown: { title: 'Coś poszło nie tak', body: 'Spróbuj ponownie. Jeśli problem się powtarza, uruchom aplikację ponownie.' },
}
export default errors
