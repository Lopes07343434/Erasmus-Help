import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Languages, Phone, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { IconTile, SectionHeader, type IconTileTone } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { TALK_TRAIN_PATH } from './dashboardPaths'
import { EmergencySheet } from './EmergencySheet'

/** Design tile: 52px surface icon tile + 12/500 label, pressed = primary-soft. */
const TILE_CLASS =
  'flex h-full w-full flex-col items-center gap-2 rounded-control border-0 bg-transparent px-0 py-3 text-text no-underline transition-colors duration-150 active:bg-primary-soft'

/**
 * Labels may wrap to two centred lines (Polish is long). `overflow-wrap:anywhere` guarantees no clipping at
 * 320px even for a single long word; hyphenation (lang from <html>) gives the nicer break when available.
 */
const LABEL_CLASS = 'w-full text-center text-xs leading-[1.25] font-medium text-pretty hyphens-auto [overflow-wrap:anywhere]'

function TileContent({ icon, tone, label }: { icon: LucideIcon; tone?: IconTileTone; label: ReactNode }) {
  return (
    <>
      <IconTile icon={icon} variant="surface" tone={tone} />
      <span className={LABEL_CLASS}>{label}</span>
    </>
  )
}

/** "Ações rápidas": Emergência (sheet with 112), Tradutor, Treinar, Definições. */
export function QuickActions() {
  const { t } = useI18n()
  const headingId = useId()
  const [emergencyOpen, setEmergencyOpen] = useState(false)

  const links: { key: string; to: string; icon: LucideIcon; label: string }[] = [
    { key: 'translate', to: ROUTES.translate, icon: Languages, label: t('dashboard.quick.translate') },
    { key: 'train', to: TALK_TRAIN_PATH, icon: Sparkles, label: t('dashboard.quick.train') },
    { key: 'settings', to: ROUTES.settings, icon: Settings, label: t('dashboard.quick.settings') },
  ]

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader id={headingId} title={t('dashboard.quick.title')} />
      <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
        <li>
          <button type="button" aria-haspopup="dialog" onClick={() => setEmergencyOpen(true)} className={TILE_CLASS}>
            <TileContent icon={Phone} tone="danger" label={t('dashboard.quick.emergency')} />
          </button>
        </li>
        {links.map(({ key, to, icon, label }) => (
          <li key={key}>
            <Link to={to} className={TILE_CLASS}>
              <TileContent icon={icon} label={label} />
            </Link>
          </li>
        ))}
      </ul>
      <EmergencySheet open={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </section>
  )
}
