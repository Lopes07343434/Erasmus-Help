import { useRef, useState, type RefObject } from 'react'
import { Button, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { NameField } from '@/pages/onboarding/components/NameField'
import { validateName } from '@/utils/validation'

interface NameSheetProps {
  open: boolean
  onClose: () => void
  currentName: string
  /** Returns false when the store rejects the value. */
  onSave: (name: string) => boolean
}

export function NameSheet({ open, onClose, currentName, onSave }: NameSheetProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.sheets.name')} initialFocusRef={inputRef}>
      <NameForm currentName={currentName} onSave={onSave} inputRef={inputRef} />
    </Sheet>
  )
}

/** Mounted only while the sheet is open, so the draft starts from the saved name each time. */
function NameForm({ currentName, onSave, inputRef }: Pick<NameSheetProps, 'currentName' | 'onSave'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(currentName)
  const [touched, setTouched] = useState(false)
  const result = validateName(draft)
  const unchanged = result.ok && result.value === currentName

  const save = () => {
    setTouched(true)
    if (result.ok && !unchanged) onSave(result.value)
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      <NameField
        value={draft}
        onChange={(v) => {
          setTouched(true)
          setDraft(v)
        }}
        onSubmit={save}
        showErrors={touched}
        inputRef={inputRef}
      />
      <Button fullWidth disabled={!result.ok || unchanged} onClick={save}>
        {t('common.actions.save')}
      </Button>
    </div>
  )
}
