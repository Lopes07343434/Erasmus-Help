const BLOBS = 'radial-gradient(70% 38% at 90% 0%, var(--blob1), transparent 70%), radial-gradient(60% 34% at 0% 62%, var(--blob2), transparent 70%)'

/**
 * Fixed full-viewport app background: var(--bg) with the two prototype blobs. Render it first; content
 * placed after it with `relative z-(--z-content)` paints above.
 */
export function AppBackground() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-bg transition-colors duration-300" style={{ backgroundImage: BLOBS }} />
}
