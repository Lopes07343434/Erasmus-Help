import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CircleAlert, MicOff, Send } from 'lucide-react'
import { AudioRecorderBar, MicButton, recorderErrorMessageKey } from '@/components/chat/audio'
import { cn, useToast } from '@/components/ui'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useI18n } from '@/i18n/I18nProvider'
import type { RecordedAudio } from '@/services/audio'
import { CHAT_LIMITS } from '@/services/chat/types'
import { chatErrorMessage } from '../chatErrors'
import { useLatest } from '../chatHooks'

interface ComposerProps {
  onSendText: (body: string) => Promise<void>
  onSendAudio: (audio: RecordedAudio) => Promise<void>
}

/** The field grows up to ~6 lines, then scrolls. */
const MAX_FIELD_PX = 148
const COUNTER_FROM = CHAT_LIMITS.textMaxLength - 400

/**
 * Message composer (content of the sticky glass bar): auto-growing textarea (max 4000) + mic button, which becomes a
 * send button once there is text. Desktop (fine pointer): Enter sends, Shift+Enter adds a line; touch: Enter is a new
 * line and the button sends. While recording, the AudioRecorderBar replaces the field (cancel / stop-and-send).
 */
export function Composer({ onSendText, onSendAudio }: ComposerProps) {
  const i18n = useI18n()
  const { t, formatNumber } = i18n
  const toast = useToast()
  const fieldId = useId()
  const hintId = useId()
  const counterId = useId()
  const [text, setText] = useState('')
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const sendAudioRef = useLatest(onSendAudio)
  const sendTextRef = useLatest(onSendText)

  const fail = useCallback((err: unknown) => toast.show(chatErrorMessage(err, i18n), { icon: CircleAlert, duration: 3200 }), [toast, i18n])

  const sendVoice = useCallback(
    (audio: RecordedAudio) => {
      sendAudioRef.current(audio).catch(fail)
    },
    [sendAudioRef, fail],
  )

  // A take that ends on its own (max duration, microphone lost) is sent like a manual stop.
  const recorder = useAudioRecorder({ onAutoStop: sendVoice })
  const recording = recorder.status === 'requesting' || recorder.status === 'recording' || recorder.status === 'stopping'

  const { status: recorderStatus, error: recorderError, clearError } = recorder
  useEffect(() => {
    if (recorderStatus !== 'error' || !recorderError) return
    toast.show(t(recorderErrorMessageKey(recorderError)), { icon: MicOff, duration: 3600 })
    clearError()
  }, [recorderStatus, recorderError, clearError, toast, t])

  // Focus follows the swap field ↔ recorder bar (the tapped mic button disappears).
  const wasRecording = useRef(false)
  useEffect(() => {
    if (recorderStatus === 'recording') barRef.current?.querySelector<HTMLButtonElement>('button:last-of-type')?.focus()
    else if (!recording && wasRecording.current) actionRef.current?.focus({ preventScroll: true })
    wasRecording.current = recording
  }, [recorderStatus, recording])

  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_PX)}px`
    el.style.overflowY = el.scrollHeight > MAX_FIELD_PX ? 'auto' : 'hidden'
  }, [text, recording])

  const trimmed = text.trim()
  const canSend = trimmed.length > 0 && trimmed.length <= CHAT_LIMITS.textMaxLength

  const submit = () => {
    if (!canSend) return
    const body = text
    setText('')
    fieldRef.current?.focus()
    sendTextRef.current(body).catch((err: unknown) => {
      // Validation failures only (network failures stay as a failed bubble): give the text back.
      setText((current) => current || body)
      fail(err)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || !finePointer || e.nativeEvent.isComposing) return
    e.preventDefault()
    submit()
  }

  const stopAndSend = async () => {
    const audio = await recorder.stop()
    if (audio) sendVoice(audio)
  }

  if (recording) {
    return (
      <div ref={barRef} className="flex min-w-0">
        <AudioRecorderBar
          status={recorder.status}
          elapsedMs={recorder.elapsedMs}
          levels={recorder.levels}
          maxDurationMs={recorder.maxDurationMs}
          onStop={() => void stopAndSend()}
          onCancel={recorder.cancel}
        />
      </div>
    )
  }

  const showCounter = text.length >= COUNTER_FROM
  return (
    <div className="flex flex-col gap-1">
      {showCounter ? (
        <p id={counterId} className={cn('m-0 px-4 text-right text-xs font-medium tabular-nums', text.length >= CHAT_LIMITS.textMaxLength ? 'text-danger' : 'text-text3')}>
          {t('chat.composer.counter', { count: formatNumber(text.length), max: formatNumber(CHAT_LIMITS.textMaxLength) })}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        {/* 22px radius = a pill while single-line, like the recorder bar that replaces it. */}
        <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-[22px] border border-solid border-border-strong bg-surface px-4 backdrop-blur-[16px] transition-[border-color,box-shadow] duration-200 focus-within:border-primary focus-within:shadow-[0_0_0_4px_var(--primary-soft)]">
          <label htmlFor={fieldId} className="sr-only">
            {t('chat.composer.label')}
          </label>
          <textarea
            ref={fieldRef}
            id={fieldId}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={CHAT_LIMITS.textMaxLength}
            placeholder={t('chat.composer.placeholder')}
            enterKeyHint={finePointer ? 'send' : 'enter'}
            autoComplete="off"
            aria-describedby={cn(finePointer && hintId, showCounter && counterId) || undefined}
            className="block w-full resize-none border-0 bg-transparent py-[11px] font-sans text-[15px] leading-[1.4] font-medium text-text outline-none placeholder:text-text3"
          />
          {finePointer ? (
            <span id={hintId} className="sr-only">
              {t('chat.composer.enterHint')}
            </span>
          ) : null}
        </div>
        {canSend ? (
          <button
            ref={actionRef}
            type="button"
            onClick={submit}
            // Keep the focus (and the on-screen keyboard) in the field when tapping send.
            onPointerDown={(e) => e.preventDefault()}
            aria-label={t('chat.composer.send')}
            className="grid size-11 shrink-0 place-items-center rounded-full border-0 bg-primary-strong text-white transition duration-150 active:scale-[.94]"
          >
            <Send size={19} aria-hidden="true" />
          </button>
        ) : (
          <MicButton ref={actionRef} onClick={recorder.start} />
        )}
      </div>
    </div>
  )
}
