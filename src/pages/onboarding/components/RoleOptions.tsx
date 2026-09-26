import { IconTile } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { UserRole } from '@/types/profile'
import { RadioCards, type RadioCardOption } from './RadioCards'
import { ROLE_ICONS, ROLES } from './roleIcons'

interface RoleOptionsProps {
  value: UserRole | null
  onChange: (role: UserRole) => void
  onActivate?: (role: UserRole) => void
  'aria-labelledby'?: string
  'aria-label'?: string
}

/** Aluno / Monitor choice (onboarding question and Profile → Função). */
export function RoleOptions({ value, onChange, onActivate, ...aria }: RoleOptionsProps) {
  const { t } = useI18n()
  const options: RadioCardOption<UserRole>[] = ROLES.map((role) => ({
    value: role,
    title: t(`common.roles.${role}`),
    description: t(`onboarding.role.descriptions.${role}`),
    leading: <IconTile icon={ROLE_ICONS[role]} />,
  }))
  return <RadioCards options={options} value={value} onChange={onChange} onActivate={onActivate} {...aria} />
}
