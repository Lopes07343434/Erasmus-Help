import { memo, useState } from 'react'
import { UserRound, Users } from 'lucide-react'
import { cn } from '@/components/ui'
import { avatarUrl } from '@/services/chat/avatars'
import { initials } from '@/utils/validation'

interface ChatAvatarProps {
  /** Person's display name (initials). Ignored for groups. */
  name?: string
  group?: boolean
  /** Photo path in the `avatars` bucket (person or group). Falls back to initials / the group icon. */
  photo?: string | null
  /** Diameter in px: 44 in lists, 40 in the conversation header, 36 in participant rows. */
  size?: number
  className?: string
}

/**
 * Decorative round avatar on primary-soft: the photo when there is one, otherwise initials for a person (like the
 * prototype's "person" chip) or a people icon for a group. A photo that fails to load falls back the same way.
 */
export const ChatAvatar = memo(function ChatAvatar({ name = '', group = false, photo = null, size = 44, className }: ChatAvatarProps) {
  const url = avatarUrl(photo)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const letters = group ? '' : initials(name)
  const iconSize = Math.round(size * 0.45)
  const showPhoto = url !== null && url !== failedUrl
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary select-none', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {showPhoto ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url)}
          className="size-full object-cover"
        />
      ) : group ? (
        <Users size={iconSize} />
      ) : (
        letters || <UserRound size={iconSize} />
      )}
    </span>
  )
})
