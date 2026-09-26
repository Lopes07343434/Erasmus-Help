/**
 * DEVELOPMENT-ONLY practice scripts for the mock AI provider (loaded lazily behind `import.meta.env.DEV`).
 * The café script follows the design prototype (Italian café) and is written for every registry language.
 * `{name}` is replaced by " <userName>" or removed.
 */
import type { PhraseSet } from '../translation/mockPhrases'
import type { PracticeScenario } from './types'

export interface PracticeScript {
  opening: PhraseSet
  /** What the user is expected to say at each turn (used by the mock recognizer). */
  userLines: readonly PhraseSet[]
  /** AI reply for user turn n (cycled). */
  replies: readonly PhraseSet[]
}

const GENERIC_REPLIES: readonly PhraseSet[] = [
  {
    it: 'Capito. Puoi dirmi qualcosa di più?',
    'pt-PT': 'Percebo. Podes dizer-me um pouco mais?',
    en: 'I see. Can you tell me a bit more?',
    es: 'Entiendo. ¿Puedes contarme un poco más?',
    fr: "Je vois. Tu peux m'en dire un peu plus ?",
    de: 'Verstehe. Kannst du mir etwas mehr erzählen?',
    pl: 'Rozumiem. Możesz powiedzieć coś więcej?',
  },
  {
    it: 'Perfetto, grazie. Hai altre domande?',
    'pt-PT': 'Perfeito, obrigado. Tens mais alguma pergunta?',
    en: 'Perfect, thank you. Do you have any other questions?',
    es: 'Perfecto, gracias. ¿Tienes alguna otra pregunta?',
    fr: "Parfait, merci. Tu as d'autres questions ?",
    de: 'Perfekt, danke. Hast du noch weitere Fragen?',
    pl: 'Świetnie, dziękuję. Masz jeszcze jakieś pytania?',
  },
  {
    it: 'Molto bene! Per oggi è tutto. A presto!',
    'pt-PT': 'Muito bem! Por hoje é tudo. Até breve!',
    en: "Very good! That's all for today. See you soon!",
    es: '¡Muy bien! Eso es todo por hoy. ¡Hasta pronto!',
    fr: "Très bien ! C'est tout pour aujourd'hui. À bientôt !",
    de: "Sehr gut! Das war's für heute. Bis bald!",
    pl: 'Bardzo dobrze! To wszystko na dziś. Do zobaczenia!',
  },
]

export const PRACTICE_SCRIPTS: Readonly<Record<PracticeScenario, PracticeScript>> = {
  cafe: {
    opening: {
      it: 'Ciao{name}! Oggi siamo al bar. Cosa prendi?',
      'pt-PT': 'Olá{name}! Hoje estamos no café. O que vais tomar?',
      en: "Hi{name}! Today we're at the café. What would you like?",
      es: '¡Hola{name}! Hoy estamos en la cafetería. ¿Qué vas a tomar?',
      fr: "Salut{name} ! Aujourd'hui, on est au café. Qu'est-ce que tu prends ?",
      de: 'Hallo{name}! Heute sind wir im Café. Was möchtest du?',
      pl: 'Cześć{name}! Dziś jesteśmy w kawiarni. Co zamawiasz?',
    },
    userLines: [
      {
        it: 'Vorrei un cappuccino, per favore.',
        'pt-PT': 'Queria um cappuccino, por favor.',
        en: "I'd like a cappuccino, please.",
        es: 'Quisiera un capuchino, por favor.',
        fr: "Je voudrais un cappuccino, s'il vous plaît.",
        de: 'Ich hätte gern einen Cappuccino, bitte.',
        pl: 'Poproszę cappuccino.',
      },
      {
        it: 'Al banco, grazie.',
        'pt-PT': 'Ao balcão, obrigado.',
        en: 'At the counter, thanks.',
        es: 'En la barra, gracias.',
        fr: 'Au comptoir, merci.',
        de: 'An der Theke, danke.',
        pl: 'Przy barze, dziękuję.',
      },
      {
        it: 'Posso pagare con la carta?',
        'pt-PT': 'Posso pagar com cartão?',
        en: 'Can I pay by card?',
        es: '¿Puedo pagar con tarjeta?',
        fr: 'Je peux payer par carte ?',
        de: 'Kann ich mit Karte zahlen?',
        pl: 'Mogę zapłacić kartą?',
      },
    ],
    replies: [
      {
        it: 'Certo! Al banco o al tavolo?',
        'pt-PT': 'Claro! Ao balcão ou à mesa?',
        en: 'Of course! At the counter or at a table?',
        es: '¡Claro! ¿En la barra o en la mesa?',
        fr: 'Bien sûr ! Au comptoir ou en salle ?',
        de: 'Gern! An der Theke oder am Tisch?',
        pl: 'Oczywiście! Przy barze czy przy stoliku?',
      },
      {
        it: 'Perfetto. Sono un euro e cinquanta.',
        'pt-PT': 'Perfeito. São um euro e cinquenta.',
        en: "Perfect. That's one euro fifty.",
        es: 'Perfecto. Es un euro con cincuenta.',
        fr: 'Parfait. Ça fait un euro cinquante.',
        de: 'Perfekt. Das macht einen Euro fünfzig.',
        pl: 'Świetnie. To będzie półtora euro.',
      },
      {
        it: 'Sì, nessun problema. Buona giornata!',
        'pt-PT': 'Sim, sem problema. Bom dia!',
        en: 'Yes, no problem. Have a nice day!',
        es: 'Sí, sin problema. ¡Que tengas un buen día!',
        fr: 'Oui, pas de problème. Bonne journée !',
        de: 'Ja, kein Problem. Einen schönen Tag noch!',
        pl: 'Tak, nie ma problemu. Miłego dnia!',
      },
    ],
  },
  landlord: {
    opening: {
      it: "Ciao{name}! Sono il proprietario. Vuoi vedere l'appartamento?",
      'pt-PT': 'Olá{name}! Sou o senhorio. Queres ver o apartamento?',
      en: "Hi{name}! I'm the landlord. Would you like to see the flat?",
      es: '¡Hola{name}! Soy el casero. ¿Quieres ver el piso?',
      fr: "Bonjour{name} ! Je suis le propriétaire. Tu veux visiter l'appartement ?",
      de: 'Hallo{name}! Ich bin der Vermieter. Möchtest du die Wohnung sehen?',
      pl: 'Cześć{name}! Jestem właścicielem. Chcesz obejrzeć mieszkanie?',
    },
    userLines: [],
    replies: GENERIC_REPLIES,
  },
  office: {
    opening: {
      it: 'Buongiorno{name}! Ufficio Erasmus. Come posso aiutarti?',
      'pt-PT': 'Bom dia{name}! Gabinete Erasmus. Como posso ajudar?',
      en: 'Good morning{name}! Erasmus office. How can I help you?',
      es: '¡Buenos días{name}! Oficina Erasmus. ¿En qué puedo ayudarte?',
      fr: "Bonjour{name} ! Bureau Erasmus. Comment puis-je t'aider ?",
      de: 'Guten Morgen{name}! Erasmus-Büro. Wie kann ich dir helfen?',
      pl: 'Dzień dobry{name}! Biuro Erasmusa. W czym mogę pomóc?',
    },
    userLines: [],
    replies: GENERIC_REPLIES,
  },
}

/** Every scripted phrase set (so the mock translator also knows them). */
export const ALL_SCRIPT_PHRASES: readonly PhraseSet[] = Object.values(PRACTICE_SCRIPTS).flatMap((s) => [s.opening, ...s.userLines, ...s.replies])

export function fillName(template: string, userName?: string): string {
  const name = userName?.trim()
  return template.replace('{name}', name ? ` ${name}` : '')
}
