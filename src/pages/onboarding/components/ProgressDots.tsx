import { cn } from '@/components/ui/cn'

/** Prototype dots: active 22×6 primary, inactive 6×6 border-strong, animated width/colour. */
export function ProgressDots({ index, total, label }: { index: number; total: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex shrink-0 gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-[3px] transition-[width,background-color] duration-300',
            i === index ? 'w-[22px] bg-primary' : 'w-1.5 bg-border-strong',
          )}
        />
      ))}
    </div>
  )
}
