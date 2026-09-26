/** Unread counters are capped by the server at 100: show "99+" above 99. */
export function formatUnread(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  return n > 99 ? '99+' : String(n)
}
