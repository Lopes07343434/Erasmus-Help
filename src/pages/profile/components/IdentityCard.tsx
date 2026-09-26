import { GlassCard } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { getCountryName } from '@/services/geo'
import type { UserLocation, UserRole } from '@/types/profile'
import { initials } from '@/utils/validation'

interface IdentityCardProps {
  name: string
  role: UserRole | null
  location: UserLocation | null
}

/** Prototype identity card: 56px initials avatar, name 17/700, role and "Cidade, País" in 13 text3. */
export function IdentityCard({ name, role, location }: IdentityCardProps) {
  const { t, locale } = useI18n()
  return (
    <GlassCard className="flex items-center gap-3.5">
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-white">
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <p className="m-0 text-[17px] leading-[1.25] font-bold break-words">{name}</p>
        {role ? <p className="m-0 text-[13px] text-text3">{t(`common.roles.${role}`)}</p> : null}
        <p className="m-0 text-[13px] break-words text-text3">
          {location ? `${location.city.name}, ${getCountryName(location.countryCode, locale)}` : t('profile.identity.noLocation')}
        </p>
      </div>
    </GlassCard>
  )
}
