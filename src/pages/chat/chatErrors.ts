import { errorI18nKey } from '@/components/feedback/errorI18nKey'
import type { I18nValue } from '@/i18n/I18nProvider'
import type { ChatErrorCode } from '@/services/chat/api'
import { toAppError } from '@/services/errors'

/**
 * Chat reasons the UI localizes (chat.errors.*): the RPC codes, plus session-level ones — anonymous sign-ins
 * disabled (or a CAPTCHA required) on the project, and an expired session (re-established on retry).
 */
export type ChatUiErrorCode = ChatErrorCode | 'anonymous_disabled' | 'not_authenticated'

const CODES: readonly ChatUiErrorCode[] = [
  'not_allowed',
  'not_found',
  'invalid_input',
  'already_associated',
  'already_member',
  'not_verified',
  'archived',
  'last_manager',
  'anonymous_disabled',
  'not_authenticated',
]

function asCode(value: unknown): ChatUiErrorCode | null {
  if (typeof value !== 'string') return null
  // Supabase Auth codes / data-layer details with the same user-facing meaning.
  if (value === 'anonymous_provider_disabled' || value === 'captcha_required') return 'anonymous_disabled'
  return (CODES as readonly string[]).includes(value) ? (value as ChatUiErrorCode) : null
}

/**
 * Finds a chat error code in a thrown value. The data layer throws `ChatError` (an AppError whose `chatCode` /
 * `detail` holds the reason); also accepted: the code string itself, a PostgREST error `{ code: 'P0001',
 * message: '<code>' }`, a Supabase Auth error `{ code: 'anonymous_provider_disabled' }`, or any of these as the
 * `cause` of an AppError (up to 3 levels).
 */
export function chatErrorCode(err: unknown): ChatUiErrorCode | null {
  let current: unknown = err
  for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth += 1) {
    const direct = asCode(current)
    if (direct) return direct
    if (typeof current !== 'object') return null
    const record = current as Record<string, unknown>
    const found = asCode(record.chatCode) ?? asCode(record.detail) ?? asCode(record.code) ?? asCode(record.message)
    if (found) return found
    current = record.cause
  }
  return null
}

export interface ChatErrorOptions {
  /** 'person': an AppError('not-found') means "nobody with that ID" (ID lookups). Default 'generic'. */
  notFound?: 'person' | 'generic'
}

/** Short, localized, user-facing message for a failed chat action (toasts and inline field errors). Never technical. */
export function chatErrorMessage(err: unknown, { t }: Pick<I18nValue, 't'>, options: ChatErrorOptions = {}): string {
  const chat = chatErrorCode(err)
  if (chat) return t(`chat.errors.${chat}`)
  const { code } = toAppError(err)
  if (code === 'not-found' && options.notFound === 'person') return t('chat.errors.not_found')
  if (code === 'permission-denied') return t('chat.errors.not_allowed')
  return t(`${errorI18nKey(code)}.title`)
}
