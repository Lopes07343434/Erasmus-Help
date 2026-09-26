import type { NamespaceShape } from '../../types'

const audio: NamespaceShape<'audio'> = {
  mic: {
    record: 'Nagraj wiadomość głosową',
    requesting: 'Prośba o dostęp do mikrofonu…',
    unsupported: 'Ta przeglądarka nie umożliwia nagrywania wiadomości głosowych',
  },
  recorder: {
    recording: 'Nagrywanie',
    requesting: 'Prośba o dostęp…',
    stopping: 'Kończenie nagrania…',
    recordingFor: 'Nagrywanie: {time}',
    cancel: 'Anuluj nagrywanie',
    stop: 'Zatrzymaj nagrywanie',
    send: 'Wyślij wiadomość głosową',
    remaining: 'Zostało {seconds} s',
    limitSoon: 'Nagrywanie zakończy się automatycznie za {seconds} s',
    limit_one: 'Limit {count} minuty',
    limit_few: 'Limit {count} minut',
    limit_many: 'Limit {count} minut',
    limit_other: 'Limit {count} minuty',
  },
  player: {
    play: 'Odtwórz wiadomość głosową',
    pause: 'Wstrzymaj wiadomość głosową',
    loading: 'Ładowanie nagrania…',
    retry: 'Spróbuj odtworzyć ponownie',
    seek: 'Pozycja w wiadomości głosowej',
    position: '{current} z {total}',
    unknownDuration: 'nieznana długość',
  },
  duration: {
    seconds_one: '{count} sekunda',
    seconds_few: '{count} sekundy',
    seconds_many: '{count} sekund',
    seconds_other: '{count} sekundy',
    minutes_one: '{count} minuta',
    minutes_few: '{count} minuty',
    minutes_many: '{count} minut',
    minutes_other: '{count} minuty',
    minutesSeconds: '{minutes} {seconds}',
  },
  errors: {
    permissionDenied: 'Zezwól na dostęp do mikrofonu w ustawieniach przeglądarki.',
    notSupported: 'Nie znaleziono mikrofonu lub ta przeglądarka nie umożliwia nagrywania dźwięku.',
    tooShort: 'Nagranie jest za krótkie.',
    recordFailed: 'Nie udało się nagrać. Spróbuj ponownie.',
    playFailed: 'Nie udało się odtworzyć nagrania.',
    playUnsupported: 'To urządzenie nie obsługuje tego formatu dźwięku.',
    playOffline: 'Brak połączenia: nie można załadować nagrania.',
  },
}
export default audio
