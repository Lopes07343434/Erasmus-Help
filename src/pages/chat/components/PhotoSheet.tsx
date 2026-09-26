import { useRef, useState, type ReactNode } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { cn, ListGroup, ListRow, Sheet, Spinner } from '@/components/ui'
import { toAppError } from '@/services/errors'
import { ChatAvatar } from './ChatAvatar'

/**
 * Photo picker shared by the profile photo (Perfil) and the group photo (group info): a round avatar button with a
 * camera badge opens a sheet with the current photo, "Escolher foto" (a real file input: gallery or camera on phones)
 * and "Remover foto" when there is one. The data layer crops/resizes/re-encodes the picked image before uploading.
 */

interface PhotoEditButtonProps {
  /** Accessible name ("Adicionar foto" / "Mudar foto"). */
  label: string
  onClick: () => void
  /** The avatar itself. */
  children: ReactNode
  className?: string
}

/** Avatar as a button (≥ 44px) with a small camera badge; opens the photo sheet. */
export function PhotoEditButton({ label, onClick, children, className }: PhotoEditButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn('relative shrink-0 rounded-full border-0 bg-transparent p-0 text-inherit transition-transform duration-150 active:scale-[.96]', className)}
    >
      {children}
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full border-2 border-solid border-surface-solid bg-primary text-white"
      >
        <Camera size={12} strokeWidth={2.4} />
      </span>
    </button>
  )
}

export interface PhotoSheetLabels {
  title: string
  choose: string
  remove: string
  saving: string
  /** The picked file cannot be used (not an image, unreadable, too large). */
  invalid: string
}

interface PhotoSheetProps {
  open: boolean
  onClose: () => void
  labels: PhotoSheetLabels
  /** Current photo path (null = none). The preview falls back to initials (`name`) or the group icon. */
  photo: string | null
  name?: string
  group?: boolean
  /** Why the photo cannot be changed right now (e.g. the chat is not connected): actions disabled + this note. */
  unavailable?: string | null
  /** Saves the picked image, or removes the photo (null). Resolve → the caller confirms (toast) and closes the sheet. */
  onSave: (image: File | null) => Promise<void>
  /** Message for the other failures (offline, not allowed, archived…). */
  errorMessage: (err: unknown) => string
}

export function PhotoSheet({ open, onClose, labels, ...rest }: PhotoSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={labels.title}>
      <PhotoSheetContent labels={labels} {...rest} />
    </Sheet>
  )
}

function PhotoSheetContent({ labels, photo, name, group, unavailable, onSave, errorMessage }: Omit<PhotoSheetProps, 'open' | 'onClose'>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = busy || Boolean(unavailable)

  const save = async (image: File | null) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(image)
    } catch (err) {
      setError(toAppError(err).code === 'invalid-input' ? labels.invalid : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <ChatAvatar name={name} group={group} photo={photo} size={96} className="self-center" />

      {busy ? (
        <p role="status" className="m-0 flex items-center justify-center gap-2 text-sm font-medium text-text2">
          <Spinner size={16} className="text-primary" />
          {labels.saving}
        </p>
      ) : null}
      {unavailable ? <p className="m-0 text-center text-sm leading-[1.45] text-pretty text-text2">{unavailable}</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-center text-sm leading-[1.45] font-semibold text-pretty text-danger">
          {error}
        </p>
      ) : null}

      <ListGroup>
        <ListRow icon={ImagePlus} label={labels.choose} trailing="none" disabled={disabled} onClick={() => inputRef.current?.click()} />
        {photo ? <ListRow icon={Trash2} tone="danger" label={labels.remove} trailing="none" disabled={disabled} onClick={() => void save(null)} /> : null}
      </ListGroup>

      {/* Visually hidden but rendered (some mobile browsers ignore click() on display:none file inputs). */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          // Picking the same file again must fire `change` again.
          e.target.value = ''
          if (file) void save(file)
        }}
      />
    </div>
  )
}
