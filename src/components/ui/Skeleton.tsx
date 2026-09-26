import type { CSSProperties } from 'react'
import { cn } from './cn'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  /** Corner radius in px (design: 6 for text lines, 14 for thumbnails). */
  radius?: number
  /** Animation delay in seconds (design staggers the 2nd line by .15s). */
  delay?: number
  className?: string
  style?: CSSProperties
}

/** Shimmering placeholder block (skel colour, ehShimmer 1.1s). Decorative: wrap groups in an element with aria-busy. */
export function Skeleton({ width = '100%', height = 16, radius = 6, delay, className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('shrink-0 animate-eh-shimmer bg-skel', className)}
      style={{ width, height, borderRadius: radius, animationDelay: delay ? `${delay}s` : undefined, ...style }}
    />
  )
}
