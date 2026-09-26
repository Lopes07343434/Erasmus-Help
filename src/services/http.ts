import { AppError } from './errors'

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

/**
 * fetch + JSON with timeout, abort propagation and AppError mapping.
 * Response bodies are returned as `unknown`: callers must validate the shape (system boundary).
 */
export async function requestJson(url: string, opts: RequestOptions = {}): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError('offline')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), opts.timeoutMs ?? 12000)
  const onAbort = () => controller.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
    })
    if (res.status === 429) throw new AppError('rate-limited')
    if (res.status === 404) throw new AppError('not-found')
    if (res.status >= 500) throw new AppError('unavailable')
    if (!res.ok) throw new AppError('unknown')
    return (await res.json()) as unknown
  } catch (err) {
    if (err instanceof AppError) throw err
    if (controller.signal.aborted) {
      const reason: unknown = controller.signal.reason
      const timedOut = reason instanceof DOMException && reason.name === 'TimeoutError'
      throw new AppError(timedOut ? 'timeout' : 'aborted', err)
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError('offline', err)
    throw new AppError('unavailable', err)
  } finally {
    clearTimeout(timeout)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
