import { BrandRow } from '@/components/brand'
import { useWeather } from '@/hooks/useWeather'
import { useProfileStore } from '@/stores/profileStore'
import { DashboardHeader } from './DashboardHeader'
import { LocationWeatherCard } from './LocationWeatherCard'
import { NowSection } from './NowSection'
import { QuickActions } from './QuickActions'

/**
 * Início: greeting, location + weather, main features and quick actions.
 * Phase 1 shows only real data (profile, settings, weather API) — no sample events, deadlines or weeks.
 */
export default function DashboardPage() {
  const location = useProfileStore((s) => s.location)
  const weather = useWeather(location)

  return (
    <div className="flex flex-col gap-[26px]">
      {/* The desktop SideNav already shows the brand. */}
      <BrandRow className="pt-1 lg:hidden" />
      <DashboardHeader />
      <LocationWeatherCard location={location} weather={weather} />
      <NowSection />
      <QuickActions />
    </div>
  )
}
