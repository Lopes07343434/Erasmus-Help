import { useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { MessageCircle } from 'lucide-react'
import { Button, Sheet, useToast } from '@/components/ui'
import { useStudentAssociation } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { chatErrorMessage } from '../chatErrors'
import { conversationPath } from '../chatPaths'
import { useIdLookup } from '../useIdLookup'
import { IdLookupField, PersonCard } from './IdLookup'

interface AddStudentSheetProps {
  open: boolean
  onClose: () => void
}

/** Verified monitors: student's ID → confirm name → associate → open the new conversation. */
export function AddStudentSheet({ open, onClose }: AddStudentSheetProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.addStudent.title')} initialFocusRef={inputRef}>
      <AddStudentForm onClose={onClose} inputRef={inputRef} />
    </Sheet>
  )
}

function AddStudentForm({ onClose, inputRef }: { onClose: () => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const association = useStudentAssociation()
  const lookup = useIdLookup(association.lookupStudent, {
    validate: (profile) => (profile.role === 'student' ? null : t('chat.addStudent.notStudent')),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchedAgain, setSearchedAgain] = useState(false)
  const person = lookup.found

  const associate = async () => {
    if (!person || busy) return
    setBusy(true)
    setError(null)
    try {
      const conversationId = await association.associateStudent(person.publicId)
      toast.show(t('chat.addStudent.associated', { name: person.displayName }))
      onClose()
      void navigate(conversationPath(conversationId))
    } catch (err) {
      setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <p className="m-0 text-sm leading-[1.5] text-pretty text-text2">{t('chat.addStudent.body')}</p>
      {person ? (
        <>
          <p className="m-0 text-[13px] font-semibold text-text2">{t('chat.lookup.confirmTitle')}</p>
          <PersonCard profile={person} />
          {error ? (
            <p role="alert" className="m-0 text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2.5 pt-1">
            <Button icon={MessageCircle} fullWidth loading={busy} onClick={() => void associate()}>
              {t('chat.addStudent.associate')}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => {
                setError(null)
                setSearchedAgain(true)
                lookup.reset()
              }}
            >
              {t('chat.lookup.searchAgain')}
            </Button>
          </div>
        </>
      ) : (
        <IdLookupField lookup={lookup} label={t('chat.addStudent.idLabel')} inputRef={inputRef} autoFocus={searchedAgain} />
      )}
    </div>
  )
}
