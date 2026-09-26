import { Copy } from 'lucide-react'
import { GlassCard } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { ChatAvatar } from '@/pages/chat/components/ChatAvatar'
import { PhotoEditButton } from '@/pages/chat/components/PhotoSheet'
import { getCountryName } from '@/services/geo'
import type { UserLocation } from '@/types/profile'
import { initials } from '@/utils/validation'

interface IdentityCardProps {
  name: string
  /** Localized type (Aluno / Monitor / Admin), or null when not chosen yet. */
  roleLabel: string | null
  location: UserLocation | null
  /** Chat profile photo path (null = initials). */
  photo: string | null
  /** Opens the photo sheet. Undefined when this build has no chat (photos live in the chat account). */
  onEditPhoto?: () => void
  /** "ID: 07" once the chat account exists. */
  publicId: string | null
  onCopyId: (id: string) => void
}

/**
 * Prototype identity card (56px avatar, name 17/700, 13 text3 lines): photo (tap to change), name, type and
 * "Cidade, País". Once the chat account exists, a bottom strip shows the public ID with "Copiar ID".
 */
export function IdentityCard({ name, roleLabel, location, photo, onEditPhoto, publicId, onCopyId }: IdentityCardProps) {
  const { t, locale } = useI18n()
  const avatar = photo ? (
    <ChatAvatar name={name} photo={photo} size={56} />
  ) : (
    <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-white">
      {initials(name)}
    </span>
  )

  return (
    <GlassCard className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        {onEditPhoto ? (
          <PhotoEditButton label={t(photo ? 'profile.photo.change' : 'profile.photo.add')} onClick={onEditPhoto}>
            {avatar}
          </PhotoEditButton>
        ) : (
          avatar
        )}
        <div className="flex min-w-0 flex-col gap-[3px]">
          <p className="m-0 text-[17px] leading-[1.25] font-bold break-words">{name}</p>
          {roleLabel ? <p className="m-0 text-[13px] text-text3">{roleLabel}</p> : null}
          <p className="m-0 text-[13px] break-words text-text3">
            {location ? `${location.city.name}, ${getCountryName(location.countryCode, locale)}` : t('profile.identity.noLocation')}
          </p>
        </div>
      </div>

      {publicId ? (
        <button
          type="button"
          onClick={() => onCopyId(publicId)}
          aria-label={t('chat.id.copyAria', { id: publicId })}
          className="-mx-4 -mb-4 flex min-h-14 items-center gap-3 rounded-b-card border-0 border-t border-solid border-border bg-transparent px-4 py-2.5 text-left text-text transition-colors duration-150 focus-visible:-outline-offset-2 active:bg-primary-soft"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-base font-medium text-primary">{publicId}</span>
            <span className="text-[13px] leading-[1.35] text-text3">{t('chat.id.hint')}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
            <Copy size={15} aria-hidden="true" />
            {t('chat.id.copy')}
          </span>
        </button>
      ) : null}
    </GlassCard>
  )
}
