/** BrandMark takes a height; the prototype sizes the mark by width (viewBox 128×121). */
export const markHeightForWidth = (width: number): number => Math.round((width * 121) / 128)

/** Soft radial halo behind the mark (prototype: radial-gradient(circle, blob1 0%, transparent 65%)). */
export const MARK_HALO = 'radial-gradient(circle, var(--blob1) 0%, transparent 65%)'
