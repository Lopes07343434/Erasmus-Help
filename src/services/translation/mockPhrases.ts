/**
 * DEVELOPMENT-ONLY sample phrases (from the design prototype, completed for every registry language).
 * Imported only by mock*.ts providers, which are loaded lazily behind `import.meta.env.DEV`
 * so none of this reaches production bundles. Never use as real content.
 */
import { AppError } from '../errors'
import type { LanguageCode } from '@/i18n/languages'

/** The same sentence in every registry language. */
export type PhraseSet = Readonly<Record<LanguageCode, string>>

/** Translator demo phrase + the two in-person conversation lines of each speaker. */
export const SAMPLE_PHRASES: readonly PhraseSet[] = [
  {
    'pt-PT': 'Olá, onde fica a estação de comboios mais próxima?',
    it: "Ciao, dov'è la stazione dei treni più vicina?",
    en: 'Hi, where is the nearest train station?',
    es: 'Hola, ¿dónde está la estación de tren más cercana?',
    fr: 'Bonjour, où est la gare la plus proche ?',
    de: 'Hallo, wo ist der nächste Bahnhof?',
    pl: 'Cześć, gdzie jest najbliższy dworzec kolejowy?',
  },
  {
    'pt-PT': 'Olá! Também estás de Erasmus aqui?',
    es: '¡Hola! ¿Tú también estás de Erasmus aquí?',
    it: 'Ciao! Anche tu sei qui in Erasmus?',
    en: 'Hi! Are you here on Erasmus too?',
    fr: 'Salut ! Toi aussi, tu es ici en Erasmus ?',
    de: 'Hallo! Bist du auch für Erasmus hier?',
    pl: 'Cześć! Ty też jesteś tu na Erasmusie?',
  },
  {
    'pt-PT': 'Sim, sou de Valência. Estou aqui há duas semanas.',
    es: 'Sí, soy de Valencia. Llevo dos semanas aquí.',
    it: 'Sì, sono di Valencia. Sono qui da due settimane.',
    en: "Yes, I'm from Valencia. I've been here for two weeks.",
    fr: 'Oui, je viens de Valence. Je suis ici depuis deux semaines.',
    de: 'Ja, ich komme aus Valencia. Ich bin seit zwei Wochen hier.',
    pl: 'Tak, jestem z Walencji. Jestem tu od dwóch tygodni.',
  },
  {
    'pt-PT': 'Queres ir ao encontro de estudantes na quinta?',
    es: '¿Quieres ir al encuentro de estudiantes el jueves?',
    it: "Vuoi venire all'incontro degli studenti giovedì?",
    en: 'Do you want to go to the student meetup on Thursday?',
    fr: 'Tu veux venir à la rencontre étudiante jeudi ?',
    de: 'Willst du am Donnerstag zum Studierendentreffen kommen?',
    pl: 'Chcesz iść na spotkanie studentów w czwartek?',
  },
  {
    'pt-PT': 'Claro! Encontramo-nos lá?',
    es: '¡Claro! ¿Nos vemos allí?',
    it: 'Certo! Ci vediamo lì?',
    en: 'Sure! Shall we meet there?',
    fr: 'Bien sûr ! On se retrouve là-bas ?',
    de: 'Klar! Treffen wir uns dort?',
    pl: 'Jasne! Spotkamy się tam?',
  },
]

/** Lowercase, no diacritics, no punctuation, single spaces — for tolerant phrase matching. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Finds the phrase set containing `text` (in `preferred` first, then any language). */
export function findPhraseSet(sets: readonly PhraseSet[], text: string, preferred?: LanguageCode): PhraseSet | null {
  const key = normalizeForMatch(text)
  if (!key) return null
  if (preferred) {
    const hit = sets.find((s) => normalizeForMatch(s[preferred]) === key)
    if (hit) return hit
  }
  return sets.find((s) => Object.values(s).some((v) => normalizeForMatch(v) === key)) ?? null
}

/** Simulated network latency that honours AbortSignal. */
export function mockLatency(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('aborted'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AppError('aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
