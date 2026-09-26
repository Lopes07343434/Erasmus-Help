import type { ComponentPropsWithRef } from 'react'
import { Mic } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/Spinner'
import { useI18n } from '@/i18n/I18nProvider'

type MicButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-pressed'> & {
  /** Recording in progress: danger fill + aria-pressed="true". */
  recording?: boolean
  /** Waiting for the microphone permission prompt: spinner + aria-busy. */
  requesting?: boolean
  /** Accessible name. Default: audio.mic.record ("Gravar mensagem de voz"). */
  'aria-label'?: string
}

/**
 * 44px round microphone button for the chat composer (start a voice message from its onClick: iOS needs the tap).
 * Idle = primary-soft circle with a primary mic; recording = danger fill; disabled = design-system disabled colours.
 */
export function MicButton({ recording = false, requesting = false, disabled, className, type = 'button', 'aria-label': ariaLabel, ...rest }: MicButtonProps) {
  const { t } = useI18n()
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel ?? (requesting ? t('audio.mic.requesting') : t('audio.mic.record'))}
      aria-pressed={recording}
      aria-busy={requesting || undefined}
      className={cn(
        'relative grid size-11 shrink-0 place-items-center rounded-full border-0 transition duration-150',
        disabled
          ? 'bg-(--disabled-bg) text-(--disabled-text)'
          : recording
            ? 'bg-danger text-white active:scale-[.94]'
            : 'bg-primary-soft text-primary hover:bg-primary/16 active:scale-[.94]',
        className,
      )}
    >
      {requesting ? <Spinner size={18} /> : <Mic size={20} aria-hidden="true" />}
    </button>
  )
}
