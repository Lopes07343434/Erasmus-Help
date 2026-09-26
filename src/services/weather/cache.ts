import type { Coordinates, WeatherSnapshot } from './types'
import { isWeatherSnapshot, roundCoord } from './types'

/**
 * Two-level weather cache: in-memory Map + localStorage (`eh:weather:<lat>,<lon>` at 2 dp).
 *
 * Policy (stale-while-revalidate):
 *  - age ≤ 30 min  → fresh: served without a network request;
 *  - 30 min–24 h   → stale: served immediately (flagged `stale`) while a revalidation runs,
 *                    and kept as the offline / API-down fallback;
 *  - > 24 h        → discarded ("today's" min/max would describe another day).
 * Entries from storage are parsed defensively and shape-validated; anything invalid is dropped.
 */
export const WEATHER_CACHE_TTL_MS = 30 * 60_000
export const WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60_000
/** Max entries kept in localStorage (user may change city a few times). */
const MAX_STORED_ENTRIES = 5
/** Tolerated clock skew for timestamps "in the future". */
const FUTURE_SKEW_MS = 5 * 60_000
const PREFIX = 'eh:weather:'
const VERSION = 1

export interface CachedWeather {
  data: WeatherSnapshot
  /** Older than the TTL: should be revalidated, and flagged in the UI. */
  stale: boolean
  ageMs: number
}

const memory = new Map<string, WeatherSnapshot>()

export function weatherCacheKey({ latitude, longitude }: Coordinates): string {
  return `${PREFIX}${roundCoord(latitude).toFixed(2)},${roundCoord(longitude).toFixed(2)}`
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // e.g. storage disabled by the browser
  }
}

function parseEntry(raw: string | null): WeatherSnapshot | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { v, data } = parsed as Record<string, unknown>
    return v === VERSION && isWeatherSnapshot(data) ? data : null
  } catch {
    return null
  }
}

const isUsable = (data: WeatherSnapshot, now: number): boolean => {
  const age = now - data.fetchedAt
  return age >= -FUTURE_SKEW_MS && age <= WEATHER_CACHE_MAX_AGE_MS
}

function remove(key: string): void {
  memory.delete(key)
  try {
    getStorage()?.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function readCachedWeather(coords: Coordinates, now: number = Date.now()): CachedWeather | null {
  const key = weatherCacheKey(coords)
  let data = memory.get(key) ?? null
  if (!data) {
    try {
      data = parseEntry(getStorage()?.getItem(key) ?? null)
    } catch {
      data = null
    }
    // The stored snapshot must describe the coordinates of its key (tamper / collision guard).
    if (data && weatherCacheKey(data) !== key) data = null
    if (data) memory.set(key, data)
  }
  if (!data) return null
  if (!isUsable(data, now)) {
    remove(key)
    return null
  }
  const ageMs = Math.max(0, now - data.fetchedAt)
  return { data, stale: ageMs > WEATHER_CACHE_TTL_MS, ageMs }
}

export function writeCachedWeather(snapshot: WeatherSnapshot): void {
  const key = weatherCacheKey(snapshot)
  memory.set(key, snapshot)
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify({ v: VERSION, data: snapshot }))
  } catch {
    /* quota exceeded / private mode: the memory cache still works */
  }
  pruneStorage(storage, Date.now())
}

/** Drops invalid / expired entries and keeps at most MAX_STORED_ENTRIES (newest first). */
function pruneStorage(storage: Storage, now: number): void {
  try {
    const entries: { key: string; fetchedAt: number }[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) {
        const data = parseEntry(storage.getItem(key))
        if (data && isUsable(data, now)) entries.push({ key, fetchedAt: data.fetchedAt })
        else entries.push({ key, fetchedAt: Number.NEGATIVE_INFINITY })
      }
    }
    entries.sort((a, b) => b.fetchedAt - a.fetchedAt)
    entries.forEach((e, i) => {
      if (i >= MAX_STORED_ENTRIES || e.fetchedAt === Number.NEGATIVE_INFINITY) remove(e.key)
    })
  } catch {
    /* ignore */
  }
}

/** Removes every cached weather entry (e.g. "Apagar dados deste dispositivo"). */
export function clearWeatherCache(): void {
  memory.clear()
  const storage = getStorage()
  if (!storage) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((k) => storage.removeItem(k))
  } catch {
    /* ignore */
  }
}
