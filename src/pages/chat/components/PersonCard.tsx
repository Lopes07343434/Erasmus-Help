import type { ReactNode } from 'react'
import { GlassCard } from '@/components/ui'
import type { PublicProfile } from '@/services/chat/types'
import { publicIdLabel } from '../chatFormat'
import { ChatAvatar } from './ChatAvatar'
import { RolePill } from './Pills'

/** "Is this the person?" card: avatar, name, role pill and public ID. */
export function PersonCard({ profile, children }: { profile: PublicProfile; children?: ReactNode }) {
  return (
    <GlassCard padding="sm" shadow={false} className="flex items-center gap-3">
      <ChatAvatar name={profile.displayName} photo={profile.avatarPath} />
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
