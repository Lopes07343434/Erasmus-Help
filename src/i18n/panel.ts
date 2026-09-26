import { getLanguage, type LanguageCode } from './languages'

/**
 * "Conversar com pessoa": strings shown INSIDE each person's panel, written in THAT panel's language.
 * They are independent from the app language — each person reads their own side of the phone.
 *
 * Typed as Record<LanguageCode, …> (and `translatedFrom` as Record<LanguageCode, string>), so adding a
 * language to the registry does not compile until its panel strings (and its row in every panel) exist.
 * `translatedFrom` is a full table instead of a template because the grammar changes with the source
 * language (it: dal/dallo/dall', fr: du/de l', de: aus dem …-en, pl: genitive).
 */
export interface PanelStrings {
  /** Name shown in the panel header: the reader of that panel ("Tu", "Tú", "You"). */
  you: string
  speak: string
  stop: string
  /** Idle hint, naming the panel's own language. */
  hint: string
  listening: string
  translating: string
  /** Caption above the speaker's own words. */
  said: string
  /** Caption above a received translation, by source language. */
  translatedFrom: Readonly<Record<LanguageCode, string>>
  changeLanguage: string
  replay: string
}

export const PANEL_STRINGS: Readonly<Record<LanguageCode, PanelStrings>> = {
  'pt-PT': {
    you: 'Tu',
    speak: 'Falar',
    stop: 'Parar',
    hint: 'Toca em Falar e fala em português.',
    listening: 'A ouvir…',
    translating: 'A traduzir…',
    said: 'Disseste',
    translatedFrom: {
      'pt-PT': 'Traduzido do português',
      en: 'Traduzido do inglês',
      pl: 'Traduzido do polaco',
      es: 'Traduzido do espanhol',
      fr: 'Traduzido do francês',
      de: 'Traduzido do alemão',
      it: 'Traduzido do italiano',
    },
    changeLanguage: 'Mudar idioma',
    replay: 'Ouvir de novo',
  },
  en: {
    you: 'You',
    speak: 'Speak',
    stop: 'Stop',
    hint: 'Tap Speak and talk in English.',
    listening: 'Listening…',
    translating: 'Translating…',
    said: 'You said',
    translatedFrom: {
      'pt-PT': 'Translated from Portuguese',
      en: 'Translated from English',
      pl: 'Translated from Polish',
      es: 'Translated from Spanish',
      fr: 'Translated from French',
      de: 'Translated from German',
      it: 'Translated from Italian',
    },
    changeLanguage: 'Change language',
    replay: 'Play again',
  },
  pl: {
    you: 'Ty',
    speak: 'Mów',
    stop: 'Zatrzymaj',
    hint: 'Naciśnij „Mów” i mów po polsku.',
    listening: 'Słucham…',
    translating: 'Tłumaczę…',
    said: 'Twoja wypowiedź',
    translatedFrom: {
      'pt-PT': 'Przetłumaczono z portugalskiego',
      en: 'Przetłumaczono z angielskiego',
      pl: 'Przetłumaczono z polskiego',
      es: 'Przetłumaczono z hiszpańskiego',
      fr: 'Przetłumaczono z francuskiego',
      de: 'Przetłumaczono z niemieckiego',
      it: 'Przetłumaczono z włoskiego',
    },
    changeLanguage: 'Zmień język',
    replay: 'Odtwórz ponownie',
  },
  es: {
    you: 'Tú',
    speak: 'Hablar',
    stop: 'Parar',
    hint: 'Toca Hablar y habla en español.',
    listening: 'Escuchando…',
    translating: 'Traduciendo…',
    said: 'Dijiste',
    translatedFrom: {
      'pt-PT': 'Traducido del portugués',
      en: 'Traducido del inglés',
      pl: 'Traducido del polaco',
      es: 'Traducido del español',
      fr: 'Traducido del francés',
      de: 'Traducido del alemán',
      it: 'Traducido del italiano',
    },
    changeLanguage: 'Cambiar idioma',
    replay: 'Escuchar otra vez',
  },
  fr: {
    you: 'Toi',
    speak: 'Parler',
    stop: 'Arrêter',
    hint: 'Touche Parler et parle en français.',
    listening: 'J’écoute…',
    translating: 'Traduction…',
    said: 'Tu as dit',
    translatedFrom: {
      'pt-PT': 'Traduit du portugais',
      en: 'Traduit de l’anglais',
      pl: 'Traduit du polonais',
      es: 'Traduit de l’espagnol',
      fr: 'Traduit du français',
      de: 'Traduit de l’allemand',
      it: 'Traduit de l’italien',
    },
    changeLanguage: 'Changer de langue',
    replay: 'Réécouter',
  },
  de: {
    you: 'Du',
    speak: 'Sprechen',
    stop: 'Stopp',
    hint: 'Tippe auf Sprechen und sprich Deutsch.',
    listening: 'Hört zu…',
    translating: 'Wird übersetzt…',
    said: 'Du hast gesagt',
    translatedFrom: {
      'pt-PT': 'Übersetzt aus dem Portugiesischen',
      en: 'Übersetzt aus dem Englischen',
      pl: 'Übersetzt aus dem Polnischen',
      es: 'Übersetzt aus dem Spanischen',
      fr: 'Übersetzt aus dem Französischen',
      de: 'Übersetzt aus dem Deutschen',
      it: 'Übersetzt aus dem Italienischen',
    },
    changeLanguage: 'Sprache ändern',
    replay: 'Nochmal anhören',
  },
  it: {
    you: 'Tu',
    speak: 'Parla',
    stop: 'Stop',
    hint: 'Tocca Parla e parla in italiano.',
    listening: 'Ascolto…',
    translating: 'Traduzione…',
    said: 'Hai detto',
    translatedFrom: {
      'pt-PT': 'Tradotto dal portoghese',
      en: 'Tradotto dall’inglese',
      pl: 'Tradotto dal polacco',
      es: 'Tradotto dallo spagnolo',
      fr: 'Tradotto dal francese',
      de: 'Tradotto dal tedesco',
      it: 'Tradotto dall’italiano',
    },
    changeLanguage: 'Cambia lingua',
    replay: 'Riascolta',
  },
}

export const panelStrings = (language: LanguageCode): PanelStrings => PANEL_STRINGS[language]

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function displayNames(locale: string): Intl.DisplayNames | null {
  let dn = displayNamesCache.get(locale)
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([locale], { type: 'language' })
    } catch {
      dn = null
    }
    displayNamesCache.set(locale, dn)
  }
  return dn
}

/** Registry codes carry a region only when the variant matters for speech (pt-PT); names use the base language. */
const baseLanguage = (code: LanguageCode) => code.split('-')[0] ?? code

/**
 * Name of `code` written in `locale`, with the casing used mid-sentence ("italiano", "Italian", "włoski").
 * `undefined` when Intl.DisplayNames is unavailable or has no name for it (callers pick a fallback).
 */
export function languageNameIn(locale: LanguageCode, code: LanguageCode): string | undefined {
  const base = baseLanguage(code)
  try {
    const name = displayNames(locale)?.of(base)
    return name && name !== base ? name : undefined
  } catch {
    return undefined
  }
}

/** A panel language's own name, capitalised for the language pill ("Português", "Español", "Polski"). */
export function panelLanguageName(language: LanguageCode): string {
  const name = languageNameIn(language, language) ?? getLanguage(language).nativeName
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
}
