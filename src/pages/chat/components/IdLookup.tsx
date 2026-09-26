import type { KeyboardEvent, ReactNode, Ref } from 'react'
import { Search } from 'lucide-react'
import { Button, GlassCard, TextField } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { PublicProfile } from '@/services/chat/types'
import { publicIdLabel } from '../chatFormat'
import type { IdLookupState } from '../useIdLookup'
import { ChatAvatar } from './ChatAvatar'
import { RolePill } from './Pills'

interface IdLookupFieldProps {
  lookup: IdLookupState
  label: string
  /** Button label (default "Procurar"). */
  actionLabel?: string
  /** Called with the person once found (Enter or the button). */
  onFound?: (profile: PublicProfile) => void
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
}

/**
 * ID field + search button. Not a <form> (it also lives inside the "Criar grupo" form): Enter in the field searches.
 * Errors ("Não encontrámos ninguém com esse ID") show under the field.
 */
export function IdLookupField({ lookup, label, actionLabel, onFound, inputRef, autoFocus }: IdLookupFieldProps) {
  const { t } = useI18n()
  const search = () => {
    void lookup.find().then((profile) => {
      if (profile) onFound?.(profile)
    })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    search()
  }
  return (
    <div className="flex flex-col gap-2.5">
      <TextField
        ref={inputRef}
        label={label}
        value={lookup.input}
        onChange={(e) => lookup.setInput(e.target.value)}
        onKeyDown={onKeyDown}
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={20}
        autoFocus={autoFocus}
        description={t('chat.lookup.idHint')}
        error={lookup.error}
      />
      <Button variant="secondary" size="sm" icon={Search} fullWidth loading={lookup.busy} onClick={search}>
        {actionLabel ?? t('chat.lookup.find')}
      </Button>
    </div>
  )
}

/** "Is this the person?" card: avatar, name, role pill and public ID. */
export function PersonCard({ profile, children }: { profile: PublicProfile; children?: ReactNode }) {
  return (
    <GlassCard padding="sm" shadow={false} className="flex items-center gap-3">
      <ChatAvatar name={profile.displayName} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 text-[15px] leading-[1.3] font-bold break-words">{profile.displayName}</p>
        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-text3">
          <RolePill role={profile.role} />
          <span className="font-mono text-xs font-medium">{publicIdLabel(profile.publicId)}</span>
        </p>
      </div>
      {children}
    </GlassCard>
  )
}
