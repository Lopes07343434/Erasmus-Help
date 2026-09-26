import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Moon,
  Snowflake,
  Sun,
  Thermometer,
  type LucideIcon,
} from 'lucide-react'
import type { WeatherCondition } from '@/services/weather'

const ICONS: Record<WeatherCondition, { day: LucideIcon; night: LucideIcon }> = {
  clear: { day: Sun, night: Moon },
  mainlyClear: { day: CloudSun, night: CloudMoon },
  partlyCloudy: { day: CloudSun, night: CloudMoon },
  overcast: { day: Cloud, night: Cloud },
  fog: { day: CloudFog, night: CloudFog },
  drizzle: { day: CloudDrizzle, night: CloudDrizzle },
  rain: { day: CloudRain, night: CloudRain },
  freezingRain: { day: CloudHail, night: CloudHail },
  snow: { day: CloudSnow, night: CloudSnow },
  rainShowers: { day: CloudSunRain, night: CloudMoonRain },
  snowShowers: { day: Snowflake, night: Snowflake },
  thunderstorm: { day: CloudLightning, night: CloudLightning },
}

interface WeatherIconProps {
  /** `null` (unknown provider code) renders a neutral thermometer. */
  condition: WeatherCondition | null
  isDay?: boolean
  size?: number | string
  className?: string
  strokeWidth?: number
  /** When given, the icon is exposed to assistive tech as an image with this label; otherwise it is decorative. */
  label?: string
}

export function WeatherIcon({ condition, isDay = true, size = 18, className, strokeWidth, label }: WeatherIconProps) {
  const Icon = condition ? ICONS[condition][isDay ? 'day' : 'night'] : Thermometer
  return label ? (
    <Icon size={size} className={className} strokeWidth={strokeWidth} role="img" aria-label={label} />
  ) : (
    <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" />
  )
}
