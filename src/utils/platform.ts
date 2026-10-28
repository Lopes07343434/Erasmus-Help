export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other'

export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  // iPadOS 13+ reports a Mac user agent; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mobi|Tablet|KAIOS/i.test(userAgent)) return 'other'
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return 'desktop'
  return 'other'
}

/** Platform of this device (`'other'` outside a browser). */
export function currentPlatform(): InstallPlatform {
  return typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
}
