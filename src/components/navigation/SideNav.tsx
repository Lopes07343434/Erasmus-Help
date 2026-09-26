import { NavLink } from 'react-router'
import { useUnreadCounts } from '@/hooks/chat/useUnreadCounts'
import { useI18n } from '@/i18n/I18nProvider'
import { BrandRow } from '@/components/brand/Brand'
import { cn } from '@/components/ui/cn'
import { NAV_ITEMS } from './navItems'
import { UnreadBadge } from './UnreadBadge'

/** Desktop navigation column (≥ 1024px, hidden by CSS below). Same destinations as BottomNav. */
export function SideNav() {
  const { t, tn } = useI18n()
  const unread = useUnreadCounts().total
  return (
    <aside className="fixed inset-y-0 left-0 z-(--z-nav) hidden w-[248px] flex-col gap-8 border-r border-border bg-nav px-4 pt-[max(28px,env(safe-area-inset-top))] pb-6 backdrop-blur-[24px] backdrop-saturate-160 lg:flex">
      <BrandRow className="h-12 px-3" />
      <nav aria-label={t('nav.main')}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {NAV_ITEMS.map(({ key, to, icon: Icon, end, center, unreadBadge }) => {
            const count = unreadBadge ? unread : 0
            return (
              <li key={key}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-12 items-center gap-3 rounded-control px-3 text-[15px] font-semibold no-underline transition-colors duration-150',
                      isActive ? 'bg-primary-soft text-primary' : 'text-text2 hover:bg-primary-soft',
                      center && 'pl-2',
                    )
                  }
                >
                  {center ? (
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-grad text-white">
                      <Icon size={17} />
                    </span>
                  ) : (
                    <Icon size={20} aria-hidden="true" className="shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{t(`nav.${key}`)}</span>
                  <UnreadBadge count={count} />
                  {count > 0 ? <span className="sr-only">{`, ${tn('chat.unread', count)}`}</span> : null}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
