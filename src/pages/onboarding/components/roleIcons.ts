import { GraduationCap, UsersRound, type LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types/profile'

export const ROLES: readonly UserRole[] = ['student', 'monitor']
export const ROLE_ICONS: Readonly<Record<UserRole, LucideIcon>> = { student: GraduationCap, monitor: UsersRound }
