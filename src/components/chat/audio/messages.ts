import type { I18nValue } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/types'
import type { AppError } from '@/services/errors'

/** Message for a recorder failure (useAudioRecorder().error), e.g. for a toast in the composer. */
export function recorderErrorMessageKey(error: AppError): MessageKey {
  switch (error.code) {
    case 'permission-denied':
      return 'audio.errors.permissionDenied'
    case 'not-supported':
      return 'audio.errors.notSupported'
    case 'invalid-input':
      return 'audio.errors.tooShort'
    default:
      return 'audio.errors.recordFailed'
  }
}

/** Message for a playback failure (useAudioPlayer(id).error). */
export function playerErrorMessageKey(error: AppError | null): MessageKey {
  switch (error?.code) {
    case 'not-supported':
      return 'audio.errors.playUnsupported'
    case 'offline':
      return 'audio.errors.playOffline'
    default:
      return 'audio.errors.playFailed'
  }
}

/** "1 minuto e 5 segundos" — for aria-valuetext / screen readers ("1:05" is read poorly). */
export function spokenDuration(ms: number, { t, tn }: Pick<I18nValue, 't' | 'tn'>): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes === 0) return tn('audio.duration.seconds', seconds)
  if (seconds === 0) return tn('audio.duration.minutes', minutes)
  return t('audio.duration.minutesSeconds', { minutes: tn('audio.duration.minutes', minutes), seconds: tn('audio.duration.seconds', seconds) })
}
