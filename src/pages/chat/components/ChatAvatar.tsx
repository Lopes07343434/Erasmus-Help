import { memo } from 'react'
import { UserRound, Users } from 'lucide-react'
import { cn } from '@/components/ui'
import { initials } from '@/utils/validation'

interface ChatAvatarProps {
  /** Person's display name (initials). Ignored for groups. */
  name?: string
  group?: boolean
  /** Diameter in px: 44 in lists, 40 in the conversation header, 36 in participant rows. */
  size?: number
  className?: string
}

/** Decorative round avatar on primary-soft: initials for a person (like the prototype's "person" chip), people icon for a group. */
export const ChatAvatar = memo(function ChatAvatar({ name = '', group = false, size = 44, className }: ChatAvatarProps) {
  const letters = group ? '' : initials(name)
  const iconSize = Math.round(size * 0.45)
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary select-none', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {group ? <Users size={iconSize} /> : letters || <UserRound size={iconSize} />}
    </span>
  )
})
