import type { NamespaceShape } from '../../types'

const common: NamespaceShape<'common'> = {
  appName: 'Erasmus Help',
  tagline: 'Wsparcie dla studentów Erasmusa',
  actions: {
    continue: 'Dalej',
    back: 'Wstecz',
    close: 'Zamknij',
    save: 'Zapisz',
    cancel: 'Anuluj',
    retry: 'Spróbuj ponownie',
    skip: 'Pomiń',
    start: 'Zaczynamy',
    confirm: 'Potwierdź',
    copy: 'Kopiuj',
    copied: 'Skopiowano',
    listen: 'Posłuchaj',
    stop: 'Zatrzymaj',
    edit: 'Edytuj',
    change: 'Zmień',
    notNow: 'Nie teraz',
    clear: 'Wyczyść',
    reload: 'Odśwież',
    seeAll: 'Zobacz wszystko',
  },
  a11y: {
    skipToContent: 'Przejdź do treści',
  },
  status: {
    loading: 'Ładowanie…',
    offline: 'Brak połączenia',
    offlineBody: 'Jesteś offline. Niektóre funkcje wrócą po przywróceniu połączenia.',
    backOnline: 'Połączenie przywrócone',
  },
  roles: {
    student: 'Student',
    monitor: 'Opiekun',
  },
}
export default common
