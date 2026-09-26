import { publicIdLabel } from '../chatFormat'

/** "Samuel Lopes  ID: 15": the name (truncated when long) followed by the public ID, never the other way round. */
export function NameWithId({ name, publicId, className = '' }: { name: string; publicId: number; className?: string }) {
  const id = publicIdLabel(publicId)
  return (
    <span className={`flex min-w-0 items-baseline gap-1.5 ${className}`}>
      <span className="min-w-0 truncate font-semibold">{name}</span>
      {id ? <span className="shrink-0 font-mono text-[13px] font-medium text-primary tabular-nums">{id}</span> : null}
    </span>
  )
}
