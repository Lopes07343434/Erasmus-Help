import { memo } from 'react'
import { cn } from './cn'

// Exact timing from the prototype: duration 0.7 + ((i*37)%5)/10 s, delay (i%6)*0.08 s.
const BARS = Array.from({ length: 18 }, (_, i) => `ehBar ${(7 + ((i * 37) % 5)) / 10}s ease-in-out ${((i % 6) * 8) / 100}s infinite`)

/** Live-listening waveform: 18 bars 3×28, radius 2, primary. Decorative. */
export const Waveform = memo(function Waveform({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex h-7 shrink-0 items-center gap-[3px]', className)}>
      {BARS.map((animation, i) => (
        <span key={i} className="h-7 w-[3px] origin-center rounded-[2px] bg-primary" style={{ animation }} />
      ))}
    </div>
  )
})
