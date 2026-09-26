import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OTHER, THIRD, bootReady, createFakeSupabase, okResult, profileRow, resetChatTestState, type FakeSupabase } from '@/services/chat/testUtils'
import { PEOPLE_SEARCH_DEBOUNCE_MS, usePeopleSearch } from './usePeopleSearch'

const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))

let fake: FakeSupabase
/** Pending answers of search_profiles, resolved by the test in any order. */
let pending: Array<{ query: string; resolve: (rows: unknown[]) => void; reject: (err: unknown) => void }>

beforeEach(async () => {
  resetChatTestState()
  fake = createFakeSupabase()
  h.client = fake.client
  pending = []
  fake.rpc.search_profiles = (args) =>
    new Promise((resolve) => {
      const query = (args as { p_query: string }).p_query
      pending.push({
        query,
        resolve: (rows) => resolve(okResult(rows)),
        reject: (error) => resolve({ data: null, error, status: 500 }),
      })
    })
  await bootReady(fake)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resetChatTestState()
})

const flush = async (ms = PEOPLE_SEARCH_DEBOUNCE_MS) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('usePeopleSearch', () => {
  it('stays idle for nothing searchable and debounces the request', async () => {
    const { result, rerender } = renderHook(({ q }) => usePeopleSearch(q), { initialProps: { q: '' } })
    expect(result.current.status).toBe('idle')
    rerender({ q: 'a' })
    expect(result.current.status).toBe('idle') // 1 letter
    rerender({ q: '1' })
    rerender({ q: '15' })
    expect(result.current.status).toBe('loading')
    await flush(PEOPLE_SEARCH_DEBOUNCE_MS - 1)
    expect(pending).toHaveLength(0)
    await flush(1)
    expect(pending.map((p) => p.query)).toEqual(['15']) // only the last query reached the server
    await act(async () => pending[0]?.resolve([{ ...profileRow(OTHER, 15, 'Samuel Lopes', 'monitor'), exact_id_match: true }]))
    expect(result.current).toMatchObject({ status: 'success', query: '15', stale: false })
    expect(result.current.results.map((p) => [p.publicId, p.exactIdMatch])).toEqual([[15, true]])
  })

  it('keeps the previous results (stale) while the next query loads, and drops outdated answers', async () => {
    const { result, rerender } = renderHook(({ q }) => usePeopleSearch(q), { initialProps: { q: '1' } })
    await flush()
    await act(async () => pending[0]?.resolve([{ ...profileRow(OTHER, 1, 'Ana'), exact_id_match: true }]))
    rerender({ q: '15' })
    expect(result.current).toMatchObject({ status: 'loading', stale: true })
    expect(result.current.results.map((p) => p.publicId)).toEqual([1])
    await flush()
    rerender({ q: 'Carla' })
    await flush()
    // the answer for "15" arrives after the user already typed "Carla": ignored
    await act(async () => pending[1]?.resolve([{ ...profileRow(OTHER, 15, 'Samuel'), exact_id_match: true }]))
    expect(result.current.status).toBe('loading')
    await act(async () => pending[2]?.resolve([{ ...profileRow(THIRD, 3, 'Carla'), exact_id_match: false }]))
    expect(result.current).toMatchObject({ status: 'success', query: 'Carla' })
    expect(result.current.results.map((p) => p.displayName)).toEqual(['Carla'])
  })

  it('reports errors and retries on demand', async () => {
    const { result } = renderHook(() => usePeopleSearch('Ana'))
    await flush()
    await act(async () => pending[0]?.reject({ code: 'PGRST002', message: 'schema cache' }))
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('unavailable')
    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    await flush()
    await act(async () => pending[1]?.resolve([]))
    expect(result.current).toMatchObject({ status: 'success', results: [] })
  })

  it('does nothing while disabled', async () => {
    const { result } = renderHook(() => usePeopleSearch('Ana', { enabled: false }))
    await flush()
    expect(result.current.status).toBe('idle')
    expect(pending).toHaveLength(0)
  })
})
