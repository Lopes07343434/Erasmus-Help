import { useId, type ReactNode, type Ref } from 'react'
import { Check, MessageCircle, RotateCw, Search } from 'lucide-react'
import { Button, cn, Skeleton, Spinner, TextField } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { PeopleSearchState } from '@/services/chat/api'
import { CHAT_LIMITS, type PersonSearchResult, type PublicProfile } from '@/services/chat/types'
import { personResultLabel } from '../chatFormat'
import { NameWithId } from './NameWithId'
import { ChatAvatar } from './ChatAvatar'
import { MiniPill, RolePill } from './Pills'

/**
 * Shared "find people by ID or name" building blocks (rpc search_profiles via usePeopleSearch):
 *   <PeopleSearchField>  the search input (ID or name, clear button)
 *   <PeopleResults>      hint / loading / error / "Nenhum utilizador encontrado." / result rows
 *   <PersonResultRow>    "Samuel Lopes  ID: 07" over the role pill with avatar and a
 *                        trailing action, a checkbox row (multi-select) or a button row (open the chat)
 * Used by the Chat search, "Adicionar pessoa", "Criar grupo" and "Adicionar membro". A result always carries the
 * full ID, so picking "10" never picks "01".
 */

interface PeopleSearchFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  /** Visible label (default) or screen-reader only with the placeholder as visible hint. */
  hideLabel?: boolean
  placeholder?: string
  description?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
  /** Enter in the field (e.g. pick the exact ID match). */
  onSubmit?: () => void
  /** Nothing to search yet (e.g. the chat is still connecting). */
  disabled?: boolean
}

export function PeopleSearchField({ value, onChange, label, hideLabel, placeholder, description, inputRef, autoFocus, onSubmit, disabled }: PeopleSearchFieldProps) {
  const { t } = useI18n()
  return (
    <TextField
      ref={inputRef}
      // A text input with the searchbox role: type="search" would add the browser's own clear button next to ours.
      type="text"
      role="searchbox"
      label={label}
      hideLabel={hideLabel}
      placeholder={placeholder}
      description={description}
      leadingIcon={Search}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClear={() => onChange('')}
      clearLabel={t('chat.search.clear')}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || !onSubmit) return
        e.preventDefault()
        onSubmit()
      }}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="search"
      maxLength={CHAT_LIMITS.searchMaxLength}
      autoFocus={autoFocus}
      disabled={disabled}
    />
  )
}

interface PersonResultRowProps {
  person: PersonSearchResult | PublicProfile
  /** Trailing node (e.g. an "Adicionar" button). Ignored when the row itself is a toggle (`selected` defined). */
  action?: ReactNode
  /** Multi-select mode: the whole row is a checkbox. */
  selected?: boolean
  onToggle?: (person: PersonSearchResult | PublicProfile) => void
  /**
   * Open mode: the whole row is a button (e.g. open the chat with this person), named by `selectLabel` and described
   * by the person's line. `busy` shows a spinner in place of the trailing chat icon.
   */
  onSelect?: () => void
  selectLabel?: string
  busy?: boolean
  /** Greyed out with a note (e.g. "Já faz parte do grupo"). */
  disabledNote?: string
}

/** One person: avatar · "07" (mono) · name · role pill (· "ID exato") · trailing action or check mark. */
export function PersonResultRow({ person, action, selected, onToggle, onSelect, selectLabel, busy = false, disabledNote }: PersonResultRowProps) {
  const { t } = useI18n()
  const descriptionId = useId()
  const exact = 'exactIdMatch' in person && person.exactIdMatch
  const label = personResultLabel(person, { t })
  const content = (
    <>
      <ChatAvatar name={person.displayName} photo={person.avatarPath} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NameWithId name={person.displayName} publicId={person.publicId} className="text-[15px] leading-[1.3]" />
        <span className="flex flex-wrap items-center gap-1.5">
          <RolePill role={person.role} />
          {exact ? <MiniPill tone="primary">{t('chat.search.exact')}</MiniPill> : null}
          {disabledNote ? <span className="text-xs font-medium text-text3">{disabledNote}</span> : null}
        </span>
      </span>
    </>
  )

  if (selected !== undefined) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={label}
        disabled={disabledNote !== undefined}
        onClick={() => onToggle?.(person)}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-text transition-colors duration-150 focus-visible:-outline-offset-2 active:bg-primary-soft',
          selected && 'bg-primary/6',
          disabledNote !== undefined && 'opacity-55',
        )}
      >
        {content}
        <span
          aria-hidden="true"
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border-2 border-solid transition-colors duration-150',
            selected ? 'border-primary bg-primary text-white' : 'border-border-strong bg-transparent text-transparent',
          )}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      </button>
    )
  }

  if (onSelect) {
    return (
      <button
        type="button"
        aria-label={selectLabel}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        disabled={disabledNote !== undefined}
        onClick={onSelect}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-text transition-colors duration-150 hover:bg-primary/6 focus-visible:-outline-offset-2 active:bg-primary-soft',
          disabledNote !== undefined && 'opacity-55',
        )}
      >
        {content}
        <span id={descriptionId} className="sr-only">
          {label}
        </span>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          {busy ? <Spinner size={16} /> : <MessageCircle size={18} />}
        </span>
      </button>
    )
  }

  return (
    <div role="group" aria-label={label} className={cn('flex min-h-16 items-center gap-3 px-4 py-2.5', disabledNote !== undefined && 'opacity-55')}>
      {content}
      {action}
    </div>
  )
}

function ResultsSkeleton() {
  const { t } = useI18n()
  return (
    <div role="status" aria-busy="true" className="glass overflow-hidden rounded-card">
      <span className="sr-only">{t('chat.search.searching')}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
          <Skeleton width={40} height={40} radius={20} />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton width={`${55 - i * 8}%`} height={14} />
            <Skeleton width={56} height={12} delay={0.15} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface PeopleResultsProps {
  search: PeopleSearchState
  /** One row per result (usually a <PersonResultRow>). */
  renderPerson: (person: PersonSearchResult) => ReactNode
  /** Heading above the results (e.g. "Resultados"). */
  title?: string
  /** Level of that heading: h3 inside a sheet (default), h2 on a page. */
  titleAs?: 'h2' | 'h3'
  /** Shown while there is nothing to search yet (default chat.search.hint). null hides it. */
  hint?: string | null
  /** Shown when nothing matches (default chat.search.noPeople "Nenhum utilizador encontrado."). */
  emptyText?: string
  className?: string
}

/**
 * The states of a people search, all explained: nothing typed yet (hint), loading (skeleton, or the previous
 * results dimmed), error (+ Tentar novamente), no match ("Nenhum utilizador encontrado."), results (their number is
 * announced to screen readers).
 */
export function PeopleResults({ search, renderPerson, title, titleAs: Heading = 'h3', hint, emptyText, className }: PeopleResultsProps) {
  const { t, tn } = useI18n()
  const hintText = hint === undefined ? t('chat.search.hint') : hint
  const count = search.status === 'success' ? search.results.length : 0

  let body: ReactNode
  if (search.status === 'idle') {
    body = hintText ? <p className="m-0 px-1 text-[13px] leading-[1.45] text-text3">{hintText}</p> : null
  } else if (search.status === 'error') {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 px-1">
        <p className="m-0 text-sm font-semibold text-danger">{t('chat.search.error')}</p>
        <Button variant="secondary" size="sm" icon={RotateCw} onClick={search.retry}>
          {t('common.actions.retry')}
        </Button>
      </div>
    )
  } else if (search.status === 'loading' && search.results.length === 0) {
    body = <ResultsSkeleton />
  } else if (search.status === 'success' && search.results.length === 0) {
    body = (
      <p role="status" className="m-0 px-1 text-sm font-semibold text-text2">
        {emptyText ?? t('chat.search.noPeople')}
      </p>
    )
  } else {
    body = (
      <ul aria-busy={search.stale || undefined} className={cn('glass m-0 list-none overflow-hidden rounded-card p-0 transition-opacity duration-150', search.stale && 'opacity-60')}>
        {search.results.map((person) => (
          <li
            key={person.id}
            className="relative not-first:pt-px not-first:before:absolute not-first:before:inset-x-4 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border"
          >
            {renderPerson(person)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-label={title ?? t('chat.addPerson.results')} className={cn('flex flex-col gap-2', className)}>
      {title && search.status !== 'idle' ? <Heading className="m-0 mx-1 text-[13px] font-semibold tracking-[.04em] text-text3 uppercase">{title}</Heading> : null}
      {body}
      <p role="status" className="sr-only">
        {count > 0 ? tn('chat.search.resultsCount', count) : ''}
      </p>
    </section>
  )
}
