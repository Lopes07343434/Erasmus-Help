import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@/services/chat/types'
import { messageElementId } from './chatPaths'

/** Within this distance of the end the view "sticks" to new messages. */
const NEAR_BOTTOM_PX = 160

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function scrollToEnd(behavior: ScrollBehavior) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: behavior === 'smooth' && prefersReducedMotion() ? 'auto' : behavior })
}

export interface ConversationTimeline {
  /** The document is scrolled to (near) the newest message. */
  atBottom: boolean
  /** Incoming messages that arrived while scrolled up. */
  unseen: number
  /** False until the first scroll to the bottom (so the top "load older" trigger does not fire on open). */
  settled: boolean
  jumpToLatest: () => void
  /** Call right before loading older messages: the first visible message keeps its screen position afterwards. */
  keepPositionWhilePrepending: () => void
  /** New incoming messages (for the live announcer). */
  arrivals: readonly ChatMessage[]
}

/**
 * Scroll behaviour of a conversation that scrolls with the document (sticky header/composer):
 * opens at the newest message; follows new messages when at the bottom or when they are mine, otherwise counts them;
 * keeps the reading position when older messages are prepended; reports genuinely new incoming messages.
 */
export function useConversationTimeline(messages: readonly ChatMessage[], meId: string, ready: boolean): ConversationTimeline {
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const [settled, setSettled] = useState(false)
  const [arrivals, setArrivals] = useState<readonly ChatMessage[]>([])
  const atBottomRef = useRef(true)
  const initialized = useRef(false)
  const seen = useRef(new Set<string>())
  const anchor = useRef<{ id: string; top: number } | null>(null)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const distance = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight)
        const bottom = distance < NEAR_BOTTOM_PX
        atBottomRef.current = bottom
        setAtBottom(bottom)
        if (bottom) setUnseen(0)
      })
    }
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])

  useLayoutEffect(() => {
    if (!ready) return
    if (!initialized.current) {
      initialized.current = true
      messages.forEach((m) => seen.current.add(m.id))
      scrollToEnd('auto')
      // Again after the router's ScrollRestoration (a later layout effect) may have reset the page to the top.
      requestAnimationFrame(() => scrollToEnd('auto'))
      atBottomRef.current = true
      return
    }

    // Older messages were prepended: put the previously first message back where it was on screen.
    const kept = anchor.current
    if (kept && messages[0]?.id !== kept.id) {
      const el = document.getElementById(messageElementId(kept.id))
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - kept.top)
      anchor.current = null
    }

    // Genuinely new messages: unseen ids after the first message we already had (a prepended older page sits before
    // it). Array position, not timestamps: an optimistic message carries local time, which may run ahead of the server.
    const hadAny = seen.current.size > 0
    const firstKnown = messages.findIndex((m) => seen.current.has(m.id))
    const fresh = messages.filter((m, i) => !seen.current.has(m.id) && (!hadAny || (firstKnown >= 0 && i > firstKnown)))
    messages.forEach((m) => seen.current.add(m.id))
    if (fresh.length === 0) return
    const incoming = fresh.filter((m) => m.senderId !== meId)
    const mineSent = fresh.length > incoming.length
    if (mineSent || atBottomRef.current) scrollToEnd('smooth')
    else setUnseen((n) => n + incoming.length)
    if (incoming.length > 0) setArrivals(incoming)
  }, [messages, meId, ready])

  // Arm the auto-load of older messages once the initial jump to the bottom has been painted.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => setSettled(true), 400)
    return () => clearTimeout(id)
  }, [ready])

  const jumpToLatest = useCallback(() => {
    setUnseen(0)
    scrollToEnd('smooth')
  }, [])

  const firstId = messages[0]?.id ?? null
  const keepPositionWhilePrepending = useCallback(() => {
    if (!firstId) return
    const el = document.getElementById(messageElementId(firstId))
    anchor.current = el ? { id: firstId, top: el.getBoundingClientRect().top } : null
  }, [firstId])

  return { atBottom, unseen, settled, jumpToLatest, keepPositionWhilePrepending, arrivals }
}
