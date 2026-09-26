import { NavLink } from 'react-router'
import { useUnreadCounts } from '@/hooks/chat/useUnreadCounts'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/components/ui/cn'
import { NAV_ITEMS } from './navItems'
import { UnreadBadge } from './UnreadBadge'

/**
 * Mobile tab bar (< 1024px, hidden by CSS on desktop). Height = 66px + max(12px, safe-area-inset-bottom),
 * i.e. the prototype's 6px top padding + 60px row, with the real home-indicator inset instead of the fake 22px gap.
 * Chat shows the total unread counter on its icon.
 */
export function BottomNav() {
  const { t, tn } = useI18n()
  const unread = useUnreadCounts().total
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) grid h-[calc(66px_+_max(12px,env(safe-area-inset-bottom)))] grid-cols-5 items-center border-t border-border bg-nav px-2 pt-1.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[24px] backdrop-saturate-160 lg:hidden"
    >
      {NAV_ITEMS.map(({ key, to, icon: Icon, end, center, unreadBadge }) => {
        const label = t(`nav.${key}`)
        if (center) {
          return (
            <NavLink
              key={key}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'grid size-[52px] place-items-center justify-self-center rounded-full bg-grad text-white transition-[box-shadow,scale] duration-[250ms,150ms] active:scale-[.93]',
                  isActive
                    ? 'shadow-[0_0_0_6px_var(--primary-soft),0_10px_22px_-10px_var(--primary)]'
                    : 'shadow-[0_0_0_0px_var(--primary-soft),0_10px_22px_-10px_var(--primary)]',
                )
              }
            >
              <Icon size={22} aria-hidden="true" />
            </NavLink>
          )
        }
        const count = unreadBadge ? unread : 0
        return (
          <NavLink
            key={key}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 no-underline transition-[color,scale] duration-200 active:scale-[.94]',
                isActive ? 'text-primary' : 'text-text3',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative flex shrink-0">
                  <Icon size={21} aria-hidden="true" className="shrink-0" />
                  <UnreadBadge count={count} size="sm" ring className="absolute -top-1.5 left-3" />
                </span>
                <span className={cn('max-w-full truncate px-0.5 text-[11px] leading-[1.2]', isActive ? 'font-bold' : 'font-medium')}>{label}</span>
                {count > 0 ? <span className="sr-only">{`, ${tn('chat.unread', count)}`}</span> : null}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
