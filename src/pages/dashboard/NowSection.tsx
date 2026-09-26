import { useId, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Languages, UsersRound, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { GlassCardLink, IconTile, SectionHeader } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useSettingsStore } from '@/stores/settingsStore'
import { TALK_PERSON_PATH, TALK_TRAIN_PATH } from './dashboardPaths'
import { languageNameInSentence } from './dashboardText'

/** Decorative orb of the Conversar hero card — exact radial gradients and shadow from the prototype. */
const ORB_STYLE: CSSProperties = {
  background:
    'radial-gradient(circle at 34% 28%, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 26%), ' +
    'radial-gradient(circle at 72% 80%, rgba(34,196,245,.7), transparent 48%), ' +
    'radial-gradient(circle at 55% 65%, #6B93FF 0%, #2B5CF5 60%, #12297A 100%)',
  boxShadow: '0 0 0 6px rgba(255,255,255,.12), 0 0 30px rgba(255,255,255,.25)',
}

/** "O que precisas agora?": gradient Conversar (train) hero + Tradutor / Conversar com pessoa cards. */
export function NowSection() {
  const { t, locale, languageName } = useI18n()
  const conversationLanguage = useSettingsStore((s) => s.conversationLanguage)
  const headingId = useId()
  const language = languageNameInSentence(languageName(conversationLanguage), locale)

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader id={headingId} title={t('dashboard.now.title')} />

      <Link
        to={TALK_TRAIN_PATH}
        className="relative flex items-center gap-4 overflow-hidden rounded-card bg-grad p-5 text-left text-white no-underline shadow-[0_14px_30px_-14px_var(--primary)] transition-transform duration-150 active:scale-[.985]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[.06em] uppercase opacity-85">{t('dashboard.now.talk.overline')}</span>
          <span className="text-[19px] leading-[1.2] font-bold tracking-[-.01em] break-words">{t('dashboard.now.talk.title', { language })}</span>
          <span className="text-[13px] leading-[1.4] text-pretty opacity-85">{t('dashboard.now.talk.body')}</span>
        </span>
        <span aria-hidden="true" className="size-[72px] flex-none rounded-full" style={ORB_STYLE} />
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <FeatureCard to={ROUTES.translate} icon={Languages} title={t('dashboard.now.translate.title')} subtitle={t('dashboard.now.translate.subtitle')} />
        <FeatureCard to={TALK_PERSON_PATH} icon={UsersRound} title={t('dashboard.now.person.title')} subtitle={t('dashboard.now.person.subtitle')} />
      </div>
    </section>
  )
}

function FeatureCard({ to, icon, title, subtitle }: { to: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <GlassCardLink to={to}>
      <span className="flex flex-col gap-3.5">
        <IconTile icon={icon} />
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-base font-semibold break-words">{title}</span>
          <span className="text-[13px] break-words text-text3">{subtitle}</span>
        </span>
      </span>
    </GlassCardLink>
  )
}
