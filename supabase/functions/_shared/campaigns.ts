/**
 * Push campaigns: the only notifications the `send-push` function can send. Pure module (no Deno or npm
 * imports) so the frontend test suite can check it. Texts exist in every UI language of the app
 * (src/i18n/languages.ts, `ui: true`); the notification is written in the language chosen by the user.
 */

export const PUSH_LOCALES = ['pt-PT', 'en', 'pl'] as const
export type PushLocale = (typeof PUSH_LOCALES)[number]

export const PUSH_PLATFORMS = ['android', 'ios', 'desktop', 'other'] as const
export type PushPlatform = (typeof PUSH_PLATFORMS)[number]

/** In-app path opened when the notification is tapped (must match public/sw-notifications.js). */
export const PERMISSIONS_PATH = '/settings/permissions'

export interface PushPayload {
  title: string
  body: string
  /** In-app path opened on tap. */
  url: string
  /** Notifications with the same tag replace each other. */
  tag: string
}

interface CampaignDefinition {
  /** Seconds the push service keeps the message for a device that is offline. */
  ttl: number
  /** Default audience of an administrator run; `null` = every platform. */
  defaultPlatform: PushPlatform | null
  url: string
  messages: Record<PushLocale, { title: string; body: string }>
}

export const CAMPAIGNS = {
  /** Announcement: "push notifications are available" → opens the permissions screen. */
  'push-available': {
    ttl: 3 * 24 * 60 * 60,
    defaultPlatform: 'android',
    url: PERMISSIONS_PATH,
    messages: {
      'pt-PT': {
        title: 'Notificações push já disponíveis',
        body: 'Ativa as notificações para receberes mensagens e novidades do Erasmus Help. Toca para as configurar.',
      },
      en: {
        title: 'Push notifications are now available',
        body: 'Turn on notifications to get Erasmus Help messages and news. Tap to set them up.',
      },
      pl: {
        title: 'Powiadomienia push są już dostępne',
        body: 'Włącz powiadomienia, aby otrzymywać wiadomości i nowości z Erasmus Help. Dotknij, aby je skonfigurować.',
      },
    },
  },
  /** Sent by a user to their own devices (Permissions screen → "Send a test notification"). */
  test: {
    ttl: 60,
    defaultPlatform: null,
    url: PERMISSIONS_PATH,
    messages: {
      'pt-PT': { title: 'Notificação de teste', body: 'Funciona! Este dispositivo recebe notificações push do Erasmus Help.' },
      en: { title: 'Test notification', body: 'It works! This device receives Erasmus Help push notifications.' },
      pl: { title: 'Powiadomienie testowe', body: 'Działa! To urządzenie otrzymuje powiadomienia push z Erasmus Help.' },
    },
  },
} as const satisfies Record<string, CampaignDefinition>

export type CampaignId = keyof typeof CAMPAIGNS

export function isCampaignId(value: unknown): value is CampaignId {
  return typeof value === 'string' && Object.hasOwn(CAMPAIGNS, value)
}

export function isPushPlatform(value: unknown): value is PushPlatform {
  return typeof value === 'string' && (PUSH_PLATFORMS as readonly string[]).includes(value)
}

/** The user's app language when it is one we have texts for, else English. */
export function resolvePushLocale(locale: string | null | undefined): PushLocale {
  return (PUSH_LOCALES as readonly string[]).includes(locale ?? '') ? (locale as PushLocale) : 'en'
}

export function buildPayload(campaign: CampaignId, locale: string | null | undefined): PushPayload {
  const definition = CAMPAIGNS[campaign]
  const { title, body } = definition.messages[resolvePushLocale(locale)]
  return { title, body, url: definition.url, tag: campaign }
}
