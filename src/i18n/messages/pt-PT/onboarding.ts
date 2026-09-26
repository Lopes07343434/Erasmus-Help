/**
 * Onboarding (/welcome): splash → 3 intro slides → setup questions.
 * The pickers (name, role, country, city) are reused by the Profile screen, so their strings live here.
 */
export default {
  splash: {
    label: 'Erasmus Help. Toca para continuar.',
  },
  intro: {
    skip: 'Saltar introdução',
    progress: 'Ecrã {current} de {total}',
    slides: {
      welcome: {
        title: 'Boas-vindas à Erasmus Help',
        body: 'Traduz, pratica e orienta-te na tua cidade Erasmus. Tudo num só lugar.',
      },
      translate: {
        title: 'Fala. Nós traduzimos.',
        body: 'Grava a tua voz, confirma o texto reconhecido e ouve a tradução corrigida em segundos.',
      },
      practice: {
        title: 'Pratica sem medo',
        body: 'Conversa em voz alta com a app em situações reais: no café, ao arrendar casa, na secretaria da universidade.',
      },
    },
    example: {
      recognized: 'Reconhecido · {language}',
      translation: 'Tradução · {language}',
      source: 'Onde fica a estação mais próxima?',
      target: 'Dov’è la stazione più vicina?',
      corrected: 'Corrigido',
    },
  },
  progress: 'Passo {current} de {total}',
  name: {
    title: 'Qual é o teu nome?',
    body: 'É assim que a app te vai tratar.',
    label: 'Nome',
    placeholder: 'O teu nome',
    errors: {
      empty: 'Escreve o teu nome.',
      tooLong: 'O nome pode ter no máximo {max} caracteres.',
      invalid: 'Usa só letras, espaços, apóstrofos, pontos ou hífenes.',
    },
  },
  role: {
    title: 'Qual é a tua função?',
    body: 'Escolhe a opção que melhor te descreve.',
    descriptions: {
      student: 'Estou a fazer Erasmus e quero apoio no dia a dia.',
      monitor: 'Acompanho e ajudo estudantes Erasmus.',
    },
  },
  language: {
    title: 'Qual é a tua língua?',
    body: 'A app passa já a usar esta língua. Podes mudar o idioma da app quando quiseres nas Definições.',
  },
  location: {
    title: 'Onde vais estar?',
    body: 'Usamos a cidade para mostrar a meteorologia local e sugerir o idioma de conversa.',
    country: {
      label: 'País',
      placeholder: 'Escolhe o país',
      sheetTitle: 'País',
      search: 'Pesquisar país',
      emptyTitle: 'Nenhum país encontrado',
      emptyBody: 'Experimenta escrever o nome de outra forma.',
    },
    city: {
      label: 'Cidade',
      placeholder: 'Escreve o nome da cidade',
      needsCountry: 'Escolhe primeiro o país.',
      hint: 'Escreve pelo menos {min} letras.',
      searching: 'A procurar cidades…',
      results: 'Cidades encontradas',
      empty: 'Não encontrámos essa cidade em {country}. Confirma o nome e tenta outra vez.',
      offline: 'Estás sem ligação, por isso não conseguimos procurar cidades. Podes continuar com o nome que escreveste.',
      error: 'A pesquisa de cidades não está disponível agora. Podes continuar com o nome que escreveste.',
      useTyped: 'Usar «{city}»',
      selected: 'Cidade escolhida: {city}',
      typedSelected: 'Vamos guardar «{city}». A meteorologia aparece quando houver ligação.',
    },
  },
  notifications: {
    title: 'Queres receber notificações?',
    body: 'Servem para te avisarmos de mensagens e novidades importantes, mesmo com a app fechada. Podes mudar isto quando quiseres nas Definições.',
    allow: 'Permitir notificações',
    dismissed: 'Não deste autorização. Podes ativar as notificações mais tarde nas Definições.',
  },
}
