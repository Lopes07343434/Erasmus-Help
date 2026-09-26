import { memo, useMemo, type CSSProperties, type ReactNode } from 'react'

/** Port of design/Conversation Sphere.dc.html. */
export type SphereVariant = 'vidro' | 'anel' | 'aurora'
export type SphereState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

interface ConversationSphereProps {
  variant?: SphereVariant
  state?: SphereState
  /** Diameter in px (design default 196; 170 onboarding, 104 person mode). */
  size?: number
  className?: string
}

const glow = (err: boolean) => (err ? 'rgba(224,80,75,.35)' : 'rgba(43,92,245,.45)')

const BODY_ANIM: Record<SphereState, string> = {
  idle: 'ehBreath 5s ease-in-out infinite',
  listening: 'ehListen 1.5s ease-in-out infinite',
  processing: 'ehPulse .9s ease-in-out infinite',
  speaking: 'ehSpeak .8s ease-in-out infinite',
  error: 'ehShake .5s ease-in-out 1',
}

const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', borderRadius: '50%', ...style })

function halo(s: SphereState, err: boolean): ReactNode {
  return (
    <div
      key="halo"
      style={abs({
        inset: '-26%',
        background: `radial-gradient(circle,${glow(err)} 0%,transparent 62%)`,
        opacity: s === 'idle' ? 0.55 : 1,
        transition: 'opacity .6s',
        animation: s === 'speaking' ? 'ehHalo 1.2s ease-in-out infinite' : 'none',
        pointerEvents: 'none',
      })}
    />
  )
}

function ripples(s: SphereState, color: string): ReactNode[] {
  if (s !== 'listening') return []
  return [0, 0.75].map((d, i) => (
    <div key={`r${i}`} style={abs({ inset: 0, border: `1.5px solid ${color}`, animation: `ehRipple 1.5s ease-out ${d}s infinite` })} />
  ))
}

function vidro(s: SphereState, size: number): ReactNode {
  const err = s === 'error'
  const body = err
    ? 'radial-gradient(circle at 34% 28%,rgba(255,255,255,.9) 0%,rgba(255,255,255,0) 24%),radial-gradient(circle at 55% 65%,#E88A7E 0%,#B8433C 58%,#5A1B1A 100%)'
    : 'radial-gradient(circle at 34% 28%,rgba(255,255,255,.95) 0%,rgba(255,255,255,0) 24%),radial-gradient(circle at 76% 82%,rgba(34,196,245,.75),transparent 46%),radial-gradient(circle at 55% 62%,#7FA2FF 0%,#2B5CF5 55%,#10267A 100%)'
  const mask = 'radial-gradient(circle,transparent 66%,#000 67%)'
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {halo(s, err)}
      {ripples(s, '#2B5CF5')}
      {s === 'processing' ? (
        <div
          style={abs({
            inset: -12,
            background: 'conic-gradient(from 0deg,transparent 0 55%,#2B5CF5 78%,#22C4F5 92%,transparent)',
            WebkitMask: mask,
            mask,
            animation: 'ehSpin 1.1s linear infinite',
          })}
        />
      ) : null}
      <div
        style={abs({
          inset: 0,
          background: body,
          boxShadow: `inset 0 -10px 30px rgba(0,0,0,.25),inset 0 2px 1px rgba(255,255,255,.35),0 20px 50px -18px ${glow(err)}`,
          animation: BODY_ANIM[s],
        })}
      >
        <div style={abs({ inset: '8% 14% 50% 14%', background: 'linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,0))' })} />
      </div>
    </div>
  )
}

const RING_WIDTH: Record<SphereState, number> = { idle: 0.018, listening: 0.04, processing: 0.028, speaking: 0.034, error: 0.028 }
const RING_ANIM: Record<SphereState, string> = {
  idle: 'ehSpin 14s linear infinite',
  listening: 'ehSpin 5s linear infinite',
  processing: 'ehSpin .9s linear infinite',
  speaking: 'ehSpin 3s linear infinite',
  error: 'none',
}

function anel(s: SphereState, size: number): ReactNode {
  const err = s === 'error'
  const c1 = err ? '#D8453F' : '#2B5CF5'
  const c2 = err ? '#F29A8F' : '#22C4F5'
  const w = Math.round(size * RING_WIDTH[s])
  const showBars = s === 'listening' || s === 'speaking'
  const mask = `radial-gradient(closest-side,transparent calc(100% - ${w}px),#000 calc(100% - ${w - 1}px))`
  const bars = [0, 1, 2, 3, 4].map((i) => (
    <span
      key={i}
      style={{
        width: Math.max(3, size * 0.022),
        height: size * 0.2,
        borderRadius: 3,
        background: `linear-gradient(180deg,${c2},${c1})`,
        animation: showBars ? `ehBar ${s === 'speaking' ? 0.55 + i * 0.07 : 0.9 + i * 0.1}s ease-in-out ${i * 0.08}s infinite` : 'none',
        transform: showBars ? undefined : 'scaleY(.18)',
        transition: 'transform .3s',
      }}
    />
  ))
  return (
    <div style={{ position: 'relative', width: size, height: size, animation: BODY_ANIM[s] }}>
      {halo(s, err)}
      {ripples(s, c1)}
      <div
        style={abs({
          inset: 0,
          background: `conic-gradient(from 0deg,${c1},${c2},${c1} 60%,${c2},${c1})`,
          WebkitMask: mask,
          mask,
          animation: RING_ANIM[s],
          filter: `drop-shadow(0 0 ${Math.round(size * 0.04)}px ${c2}66)`,
        })}
      />
      <div
        style={abs({
          inset: '13%',
          background: 'radial-gradient(circle at 35% 28%,rgba(255,255,255,.55),rgba(255,255,255,.10) 60%,rgba(255,255,255,.04))',
          border: '1px solid rgba(255,255,255,.35)',
          boxShadow: `inset 0 0 ${size * 0.12}px ${c1}33,0 10px 30px -14px ${c1}88`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Math.max(3, size * 0.02),
        })}
      >
        {bars}
      </div>
    </div>
  )
}

const AURORA_SPIN: Record<SphereState, string> = { idle: '16s', listening: '6s', processing: '1.8s', speaking: '3.5s', error: '16s' }
const BLOB_POS: ReadonlyArray<readonly [top: string, left: string]> = [
  ['-6%', '-4%'],
  ['36%', '30%'],
  ['4%', '44%'],
]

function aurora(s: SphereState, size: number): ReactNode {
  const err = s === 'error'
  const cols = err ? ['#F29A8F', '#D8453F', '#8E2A26'] : ['#22C4F5', '#2B5CF5', '#8FB0FF']
  const blur = Math.round(size * 0.1)
  return (
    <div style={{ position: 'relative', width: size, height: size, animation: BODY_ANIM[s] }}>
      {halo(s, err)}
      {ripples(s, cols[1] ?? '#2B5CF5')}
      <div style={abs({ inset: 0, overflow: 'hidden', background: err ? '#3A1413' : '#0C1E66', boxShadow: `0 20px 50px -18px ${glow(err)}` })}>
        <div style={{ position: 'absolute', inset: 0, animation: `ehSpin ${AURORA_SPIN[s]} linear infinite` }}>
          {BLOB_POS.map(([top, left], i) => (
            <div
              key={`b${i}`}
              style={abs({
                top,
                left,
                width: '68%',
                height: '68%',
                background: cols[i],
                filter: `blur(${blur}px)`,
                opacity: 0.95,
                animation: `ehDrift ${s === 'processing' ? 1.2 + i * 0.3 : 4 + i * 1.3}s ease-in-out infinite`,
              })}
            />
          ))}
        </div>
        <div
          style={abs({
            inset: 0,
            background: 'radial-gradient(circle at 34% 26%,rgba(255,255,255,.7) 0%,rgba(255,255,255,0) 22%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25),inset 0 -12px 30px rgba(0,0,0,.25)',
          })}
        />
      </div>
    </div>
  )
}

const RENDERERS: Record<SphereVariant, (s: SphereState, size: number) => ReactNode> = { vidro, anel, aurora }

/**
 * Decorative conversation sphere (aria-hidden) — the page must show the status text.
 * Variants vidro / anel / aurora × states idle / listening / processing / speaking / error.
 * Reduced motion is handled globally in index.css.
 */
export const ConversationSphere = memo(function ConversationSphere({ variant = 'vidro', state = 'idle', size = 196, className }: ConversationSphereProps) {
  const el = useMemo(() => RENDERERS[variant](state, size), [variant, state, size])
  return (
    <div aria-hidden="true" className={className} style={{ display: 'grid', placeItems: 'center', width: size, height: size, flex: 'none' }}>
      {el}
    </div>
  )
})
