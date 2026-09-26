/** Definições (/settings). Install/notification/update texts come from the `pwa` namespace. */
export default {
  title: 'Definições',
  sections: {
    appearance: 'Aparência',
    languages: 'Idiomas',
    notifications: 'Notificações',
    app: 'App',
  },
  appearance: {
    darkMode: 'Modo escuro',
  },
  languages: {
    app: 'Idioma da app',
    conversation: 'Idioma de conversa',
    caption: 'O idioma da app muda os menus e os textos. O idioma de conversa é aquele para onde o Tradutor traduz e em que praticas no Conversar.',
    appSheetHint: 'Os menus e os textos mudam logo.',
    conversationSheetHint: 'Idioma de destino do Tradutor e da prática no Conversar.',
  },
  notifications: {
    label: 'Notificações',
    on: 'Ativadas neste dispositivo.',
    off: 'Avisos de mensagens e novidades importantes.',
    requesting: 'Responde ao pedido do browser…',
    enabledToast: 'Notificações ativadas',
    deniedToast: 'As notificações estão bloqueadas no browser.',
    dismissedToast: 'Não foi dada autorização.',
    pushError: 'Não foi possível ativar o envio de notificações agora. Tenta mais tarde.',
  },
  app: {
    installHint: 'Abre mais depressa, em ecrã inteiro, e funciona sem ligação.',
    installedToast: 'App instalada',
    about: 'Sobre a Erasmus Help',
    aboutTitle: 'Sobre',
    version: 'Versão {version}',
    replayIntro: 'Rever introdução',
  },
}
