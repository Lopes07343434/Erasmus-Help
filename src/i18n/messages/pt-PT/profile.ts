/** Perfil (/profile). The editing pickers reuse onboarding.name / onboarding.role / onboarding.location strings. */
export default {
  title: 'Perfil',
  identity: {
    noLocation: 'Localização por definir',
  },
  photo: {
    add: 'Adicionar foto',
    change: 'Mudar foto',
    remove: 'Remover foto',
    menuTitle: 'Foto de perfil',
    choose: 'Escolher foto',
    updated: 'Foto de perfil atualizada',
    removed: 'Foto de perfil removida',
    saving: 'A guardar a foto…',
    invalid: 'Não foi possível usar esta imagem. Escolhe uma foto em JPG, PNG ou WebP.',
    unavailable: 'Podes adicionar uma foto quando o chat estiver ligado.',
  },
  sections: {
    data: 'Os teus dados',
    privacy: 'Privacidade',
  },
  fields: {
    name: 'Nome',
    role: 'Função',
    myLanguage: 'Meu idioma',
    country: 'País',
    city: 'Cidade',
    notSet: 'Por definir',
    roleLocked: 'Definida na tua conta do Chat. Só um administrador a pode alterar.',
  },
  sheets: {
    name: 'O teu nome',
    role: 'A tua função',
    myLanguage: 'Meu idioma',
    myLanguageHint: 'A tua língua principal. Não muda o idioma da app, que podes escolher nas Definições.',
    cityIn: 'Cidade em {country}',
  },
  saved: 'Alterações guardadas',
  privacy: {
    row: 'Privacidade e dados',
    title: 'Privacidade e dados',
    device: {
      title: 'Os dados ficam neste dispositivo',
      body: 'O teu perfil e as tuas preferências são guardados só neste browser (armazenamento local). Não te acompanham se mudares de dispositivo ou se limpares os dados do browser.',
    },
    account: {
      title: 'Conta do chat',
      body: 'Para usares o chat, a app cria automaticamente uma conta anónima ligada a este dispositivo, sem email nem palavra-passe. O teu nome, função, ID e foto ficam visíveis para quem usa o chat; as mensagens, só para os participantes de cada conversa.',
    },
    audio: {
      title: 'O áudio não é guardado',
      body: 'A app não guarda gravações da tua voz. O reconhecimento de voz é feito pelo teu browser, que pode processar o áudio no serviço de voz do fornecedor (por exemplo, Google ou Apple).',
    },
    services: {
      title: 'Serviços externos',
      body: 'Para traduzir e praticar, o texto reconhecido é enviado para o serviço de tradução. A meteorologia e a pesquisa de cidades usam o Open-Meteo, que recebe a cidade ou as coordenadas, nunca o teu nome.',
    },
  },
  deleteData: {
    action: 'Apagar dados deste dispositivo',
    title: 'Apagar os dados deste dispositivo?',
    body: 'Vamos apagar o teu perfil, as tuas preferências e os dados em cache (meteorologia e pesquisas de cidades) guardados neste dispositivo. Este dispositivo deixa de receber notificações.',
    warning: 'Não é possível desfazer. A seguir voltas ao início para configurar a app de novo.',
    confirm: 'Apagar dados',
  },
}
