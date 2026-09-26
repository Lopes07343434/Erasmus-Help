import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/components/ui/cn'

const MARK_SRC = `${import.meta.env.BASE_URL}brand/eh-mark.svg`
const MARK_RATIO = 128 / 121 // viewBox of public/brand/eh-mark.svg

interface BrandMarkProps {
  /** Rendered height in px (header row: 22). */
  size?: number
  /** Accessible name; empty (decorative) by default. */
  alt?: string
  className?: string
}

/** Official "EH" mark (vector copy of design/assets/eh-mark.png). */
export function BrandMark({ size = 22, alt = '', className }: BrandMarkProps) {
  return (
    <img
      src={MARK_SRC}
      alt={alt}
      width={Math.round(size * MARK_RATIO * 10) / 10}
      height={size}
      draggable={false}
      className={cn('block shrink-0 select-none', className)}
      style={{ height: size, width: 'auto' }}
    />
  )
}

type WordmarkSize = 'sm' | 'md' | 'lg'

const wordmarkSizes: Record<WordmarkSize, string> = {
  sm: 'text-[15px] tracking-[-.01em]', // header row
  md: 'text-[22px] tracking-[-.02em]', // "Sobre" sheet
  lg: 'text-[32px] tracking-[-.025em]', // splash
}

/** "Erasmus Help" with the last word in primary. Text comes from common.appName. */
export function Wordmark({ size = 'sm', as: Tag = 'span', className }: { size?: WordmarkSize; as?: 'span' | 'h1' | 'p'; className?: string }) {
  const { t } = useI18n()
  const name = t('common.appName')
  const cut = name.lastIndexOf(' ')
  return (
    <Tag className={cn('m-0 leading-[1.2] font-bold whitespace-nowrap text-text', wordmarkSizes[size], className)}>
      {cut > 0 ? (
        <>
          {name.slice(0, cut)} <span className="text-primary">{name.slice(cut + 1)}</span>
        </>
      ) : (
        name
      )}
    </Tag>
  )
}

/** Mark (22px) + small wordmark, as at the top of Início / onboarding. */
export function BrandRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark size={22} />
      <Wordmark size="sm" />
    </div>
  )
}

/** 11/600 uppercase tagline (common.tagline). `compact` = .2em tracking ("Sobre"), default .24em (splash). */
export function Tagline({ compact, className }: { compact?: boolean; className?: string }) {
  const { t } = useI18n()
  return (
    <span className={cn('text-center text-[11px] font-semibold text-text3 uppercase', compact ? 'tracking-[.2em]' : 'tracking-[.24em]', className)}>
      {t('common.tagline')}
    </span>
  )
}
