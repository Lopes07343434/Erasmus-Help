import type { ReactNode } from 'react'
import { CircleAlert, History, MapPin, RotateCw, WifiOff, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/app/router'
import { errorI18nKey } from '@/components/feedback'
import { Button, ButtonLink, GlassCard, IconButton, IconTile, Skeleton, Spinner } from '@/components/ui'
import { WeatherIcon } from '@/components/weather/WeatherIcon'
import type { UseWeatherResult, WeatherData } from '@/hooks/useWeather'
import { useI18n } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/types'
import type { AppErrorCode } from '@/services/errors'
import { getCountryName } from '@/services/geo'
import { formatDataAge, roundPercent, roundTemperature } from '@/services/weather'
import type { UserLocation } from '@/types/profile'

const OPEN_METEO_URL = 'https://open-meteo.com/'

interface LocationWeatherCardProps {
  location: UserLocation | null
  weather: UseWeatherResult
}

/**
 * "Where am I + weather now" card (design: Início location card). Handles every weather state inside the
 * same card shape: no location → CTA to Perfil; loading → skeleton; data (fresh, stale, offline or error
 * with a cached reading) → values + age caption; error without data → compact error with retry.
 * Values come only from useWeather (weather API) and are hidden, never invented, when missing.
 */
export function LocationWeatherCard({ location, weather }: LocationWeatherCardProps) {
  const { t, locale } = useI18n()

  if (!location || weather.status === 'empty') return <NoLocationCard />

  const place = t('dashboard.location.place', { city: location.city.name, country: getCountryName(location.countryCode, locale) })
  const { status, data } = weather
  let card: ReactNode
  if (data) card = <WeatherDataCard place={place} city={location.city.name} weather={weather} data={data} />
  else if (status === 'error' || status === 'offline') card = <WeatherErrorCard place={place} weather={weather} />
  else card = <WeatherLoadingCard place={place} />

  return (
    <div className="flex flex-col gap-1">
      {card}
      {/* Open-Meteo data is CC BY 4.0: attribution is required wherever its data can appear. */}
      <p className="m-0 self-end px-1 text-[11px] text-text3">
        <a
          href={OPEN_METEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-6 items-center text-text3 underline decoration-border-strong underline-offset-2 transition-colors duration-150 hover:text-text2"
        >
          {t('weather.attribution')}
          <span className="sr-only"> {t('dashboard.a11y.newTab')}</span>
        </a>
      </p>
    </div>
  )
}

function CardShell({ busy, children }: { busy?: boolean; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <GlassCard as="section" aria-label={t('dashboard.location.region')} aria-busy={busy || undefined} className="flex flex-col gap-3.5">
      {children}
    </GlassCard>
  )
}

function Divider() {
  return <div aria-hidden="true" className="h-px shrink-0 bg-border" />
}

/** Map-pin tile + place (16/600) + optional subtitle (13 text3) + optional trailing weather. */
function PlaceRow({ title, subtitle, trailing }: { title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={MapPin} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-base font-semibold break-words">{title}</p>
        {subtitle}
      </div>
      {trailing}
    </div>
  )
}

function NoLocationCard() {
  const { t } = useI18n()
  return (
    <CardShell>
      <PlaceRow
        title={t('weather.states.emptyTitle')}
        subtitle={<p className="m-0 text-[13px] text-pretty text-text3">{t('weather.states.emptyBody')}</p>}
      />
      <ButtonLink to={ROUTES.profile} variant="secondary" size="sm" className="self-start">
        {t('weather.states.emptyAction')}
      </ButtonLink>
    </CardShell>
  )
}

/** Same geometry as the data card, so the swap does not move the rest of the page. */
function WeatherLoadingCard({ place }: { place: string }) {
  const { t } = useI18n()
  return (
    <CardShell busy>
      <PlaceRow
        title={place}
        subtitle={
          <div className="flex h-[19.5px] items-center">
            <Skeleton width="55%" height={12} />
          </div>
        }
        trailing={<Skeleton width={46} height={18} />}
      />
      <Divider />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            <div className="flex h-4 items-center">
              <Skeleton width="45%" height={11} delay={i ? 0.15 : undefined} />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton width="60%" height={14} delay={i ? 0.15 : undefined} />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">{t('weather.states.loading')}</p>
    </CardShell>
  )
}

interface DetailCell {
  key: string
  label: string
  value: string
}

function WeatherDataCard({ place, city, weather, data }: { place: string; city: string; weather: UseWeatherResult; data: WeatherData }) {
  const { t, locale } = useI18n()
  const { status, isRefreshing, refresh } = weather

  const deg = (celsius: number) => t('weather.values.degrees', { value: roundTemperature(celsius) })
  const temperature = roundTemperature(data.temperature)
  const feel = t(`weather.feel.${data.feel}`)
  const summary = data.condition ? t('dashboard.weather.summary', { condition: t(`weather.conditions.${data.condition}`), feel }) : feel

  const cells: DetailCell[] = []
  const { min, max, precipitationProbability: rain } = data
  if (min !== null && max !== null) {
    cells.push({
      key: 'range',
      label: t('dashboard.weather.range', { min: t('weather.fields.min'), max: t('weather.fields.max') }),
      value: t('dashboard.weather.range', { min: deg(min), max: deg(max) }),
    })
  } else if (min !== null) {
    cells.push({ key: 'min', label: t('weather.fields.min'), value: deg(min) })
  } else if (max !== null) {
    cells.push({ key: 'max', label: t('weather.fields.max'), value: deg(max) })
  }
  if (rain !== null) {
    cells.push({ key: 'rain', label: t('weather.fields.rainChanceShort'), value: t('weather.values.percent', { value: roundPercent(rain) }) })
  }

  // Age caption whenever the reading is not a fresh, successful one.
  const showAge = data.stale || status === 'offline' || status === 'error'
  const AgeIcon: LucideIcon = status === 'offline' ? WifiOff : status === 'error' ? CircleAlert : History

  // Not aria-busy while revalidating: the values stay readable (the spinner below announces the update).
  return (
    <CardShell>
      <PlaceRow
        title={place}
        subtitle={<p className="m-0 text-[13px] text-text3">{summary}</p>}
        trailing={
          <>
            <div aria-hidden="true" className="flex shrink-0 items-center gap-1.5 text-[15px] font-semibold text-text2">
              <WeatherIcon condition={data.condition} isDay={data.isDay} size={18} />
              {deg(data.temperature)}
            </div>
            <span className="sr-only">{t('weather.a11y.currentNoCondition', { city, temperature })}</span>
          </>
        }
      />
      {cells.length > 0 || showAge ? <Divider /> : null}
      {cells.length > 0 ? (
        <dl className="m-0 grid grid-cols-2 gap-3">
          {cells.map((cell) => (
            <div key={cell.key} className="flex min-w-0 flex-col gap-[3px]">
              <dt className="text-xs text-text3">{cell.label}</dt>
              <dd className="m-0 text-sm font-semibold">{cell.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {showAge ? (
        <div className="flex min-h-5 items-center gap-2 text-xs text-text3">
          <AgeIcon size={14} aria-hidden="true" className="shrink-0" />
          <p className="m-0 min-w-0 flex-1">
            {status === 'offline' ? <span className="sr-only">{t('weather.states.offlineTitle')}. </span> : null}
            {status === 'error' ? <span className="sr-only">{t('weather.states.unavailableTitle')}. </span> : null}
            {t('weather.states.stale', { ago: formatDataAge(data.fetchedAt, locale) })}
          </p>
          {isRefreshing ? (
            <Spinner size={14} label={t('dashboard.weather.refreshing')} className="shrink-0" />
          ) : status !== 'success' ? (
            <IconButton variant="plain" icon={RotateCw} iconSize={16} aria-label={t('common.actions.retry')} onClick={refresh} className="-my-3 -mr-2.5" />
          ) : null}
        </div>
      ) : null}
    </CardShell>
  )
}

interface ErrorCopy {
  title: MessageKey
  body: MessageKey
  action: 'retry' | 'profile' | null
}

/** Weather-specific texts where they exist (weather.states.*), generic errors.* otherwise. */
function errorCopy(code: AppErrorCode): ErrorCopy {
  switch (code) {
    case 'offline':
      return { title: 'weather.states.offlineTitle', body: 'weather.states.offlineBody', action: 'retry' }
    case 'not-found':
      return { title: 'weather.states.cityNotFoundTitle', body: 'weather.states.cityNotFoundBody', action: 'profile' }
    case 'not-configured':
      return { title: 'weather.states.unavailableTitle', body: 'weather.states.notConfigured', action: null }
    case 'unavailable':
    case 'unknown':
      return { title: 'weather.states.unavailableTitle', body: 'weather.states.unavailableBody', action: 'retry' }
    default: {
      const key = errorI18nKey(code)
      return { title: `${key}.title`, body: `${key}.body`, action: code === 'invalid-input' ? 'profile' : 'retry' }
    }
  }
}

function WeatherErrorCard({ place, weather }: { place: string; weather: UseWeatherResult }) {
  const { t } = useI18n()
  const code: AppErrorCode = weather.error?.code ?? (weather.status === 'offline' ? 'offline' : 'unknown')
  const copy = errorCopy(code)
  const Icon = code === 'offline' ? WifiOff : CircleAlert

  return (
    <CardShell>
      <PlaceRow title={place} />
      <Divider />
      <div role="status" className="flex items-start gap-2.5">
        <Icon size={18} aria-hidden="true" className="mt-px shrink-0 text-danger" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 text-sm font-semibold">{t(copy.title)}</p>
          <p className="m-0 text-[13px] text-pretty text-text3">{t(copy.body)}</p>
        </div>
      </div>
      {copy.action === 'retry' ? (
        <Button variant="secondary" size="sm" icon={RotateCw} onClick={weather.refresh} className="self-start">
          {t('common.actions.retry')}
        </Button>
      ) : copy.action === 'profile' ? (
        <ButtonLink to={ROUTES.profile} variant="secondary" size="sm" className="self-start">
          {t('dashboard.weather.openProfile')}
        </ButtonLink>
      ) : null}
    </CardShell>
  )
}
