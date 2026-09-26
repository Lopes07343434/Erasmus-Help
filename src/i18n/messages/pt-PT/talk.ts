/**
 * Conversar (/talk). Two separate modes — never mix their copy:
 *  - person: in-person conversation between two people sharing one phone (the sphere is the translation
 *    bridge, never a person/assistant). Texts inside each person's panel live in i18n/panel.ts.
 *  - train: the user practises speaking with the app.
 * `{lang}` receives the language name as written mid-sentence in the UI language (pt: "italiano").
 */
export default {
  title: 'Conversar',
  modes: {
    label: 'Modo de conversa',
    person: 'Conversar com pessoa',
    train: 'Treinar com a app',
  },
  person: {
    sideA: 'O teu lado',
    sideB: 'Lado da outra pessoa',
    pair: 'Tradução entre {a} e {b}',
    bridge: {
      placePhone: 'Pousa o telemóvel na mesa, entre os dois',
      yourTurn: 'Toca em Falar do teu lado',
      listeningYou: 'A ouvir-te',
      listeningOther: 'A ouvir a outra pessoa',
      translating: 'A traduzir para {lang}',
      playing: 'A reproduzir em {lang}',
    },
    sheet: {
      mine: 'O teu idioma',
      other: 'Idioma da outra pessoa',
    },
    speechUnavailable: 'Não há voz para {lang} neste dispositivo. A tradução fica no ecrã.',
  },
  train: {
    subtitle: 'Tu e a app · {lang}',
    scenario: 'Cenário',
    scenarioAria: 'Mudar cenário',
    scenarioSheet: 'Escolhe um cenário',
    scenarios: {
      cafe: { name: 'Café', title: 'Treino no café', description: 'Pedir e pagar ao balcão' },
      landlord: { name: 'Senhorio', title: 'Treino com o senhorio', description: 'Casa, renda e contrato' },
      office: { name: 'Secretaria da universidade', title: 'Treino na secretaria', description: 'Documentos e inscrições' },
    },
    log: 'Conversa de treino',
    speakerYou: 'Tu',
    speakerApp: 'App',
    translation: 'Tradução',
    states: {
      ready: { status: 'Toca na esfera para começar', hint: 'A app abre a conversa em {lang}' },
      idle: { status: 'Toca na esfera para falar', hint: 'Responde em {lang}' },
      listening: { status: 'A ouvir…', hint: 'Toca de novo quando terminares' },
      processing: { status: 'A pensar…', hint: 'Um momento' },
      speaking: { status: 'A falar', hint: 'Toca para interromper' },
    },
    sphere: {
      start: 'Começar o treino',
      speak: 'Falar com a app',
      stop: 'Parar de ouvir',
      interrupt: 'Interromper a app',
      wait: 'A app está a pensar',
    },
    controls: {
      mute: 'Desativar microfone',
      keyboard: 'Escrever mensagem',
      reset: 'Recomeçar treino',
    },
    toasts: {
      muted: 'Microfone desativado',
      keyboard: 'Modo texto em breve',
    },
  },
}
