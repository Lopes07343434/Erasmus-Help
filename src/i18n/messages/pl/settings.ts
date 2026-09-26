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
    pushError: 'Nie udało się teraz włączyć wysyłania powiadomień. Spróbuj później.',
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
