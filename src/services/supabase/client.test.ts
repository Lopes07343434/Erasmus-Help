import { describe, expect, it } from 'vitest'
import { getSupabase, isServiceRoleJwt, realtimeReconnectAfterMs } from './client'

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload: unknown) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

describe('supabase client', () => {
  it('refuses legacy service_role JWTs but accepts anon / publishable keys', () => {
    expect(isServiceRoleJwt(jwt({ role: 'service_role', iss: 'supabase' }))).toBe(true)
    expect(isServiceRoleJwt(jwt({ role: 'anon', iss: 'supabase' }))).toBe(false)
    expect(isServiceRoleJwt('sb_publishable_abc')).toBe(false)
    expect(isServiceRoleJwt('a.b.c')).toBe(false)
  })

  it('never creates a real client under test (Vitest also loads .env.local)', () => {
    expect(getSupabase()).toBeNull()
  })

  it('backs off Realtime reconnects up to 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(realtimeReconnectAfterMs)).toEqual([1000, 2000, 5000, 10000, 20000, 30000, 30000])
  })
})
