/**
 * Test-only fake of the supabase-js client used by the chat (never hits the network).
 * Not imported by app code. Usage in a test file:
 *
 *   const h = vi.hoisted(() => ({ client: null as unknown }))
 *   vi.mock('@/services/supabase/client', () => ({ getSupabase: () => h.client }))
 *   const fake = createFakeSupabase(); h.client = fake.client
 */
import { vi } from 'vitest'
import { useProfileStore } from '@/stores/profileStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from './chatStore'
import { disposeChat, startChat } from './session'

export interface FakeResult {
  data: unknown
  error: unknown
  status?: number
}

export interface RecordedQuery {
  table: string
  op: 'select' | 'insert'
  columns: string | null
  values: unknown
  /** e.g. ['eq', 'conversation_id', id], ['or', '…'], ['order', 'created_at', { ascending: false }], ['limit', 51], ['single'] */
  ops: unknown[][]
}

type Handler<A> = (arg: A) => FakeResult | Promise<FakeResult>

const ok = (data: unknown): FakeResult => ({ data, error: null, status: 200 })

class FakeQuery implements PromiseLike<FakeResult> {
  readonly q: RecordedQuery
  private readonly fake: FakeSupabase

  constructor(fake: FakeSupabase, table: string) {
    this.fake = fake
    this.q = { table, op: 'select', columns: null, values: undefined, ops: [] }
  }
  select(columns?: string) {
    this.q.columns = columns ?? null
    return this
  }
  insert(values: unknown) {
    this.q.op = 'insert'
    this.q.values = values
    return this
  }
  eq(col: string, v: unknown) {
    this.q.ops.push(['eq', col, v])
    return this
  }
  in(col: string, v: unknown) {
    this.q.ops.push(['in', col, v])
    return this
  }
  or(expr: string) {
    this.q.ops.push(['or', expr])
    return this
  }
  order(col: string, opts?: unknown) {
    this.q.ops.push(['order', col, opts])
    return this
  }
  limit(n: number) {
    this.q.ops.push(['limit', n])
    return this
  }
  single() {
    this.q.ops.push(['single'])
    return this
  }
  maybeSingle() {
    this.q.ops.push(['maybeSingle'])
    return this
  }
  then<T1 = FakeResult, T2 = never>(onfulfilled?: ((v: FakeResult) => T1 | PromiseLike<T1>) | null, onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    this.fake.queries.push(this.q)
    this.fake.calls.push(`${this.q.op}:${this.q.table}`)
    return Promise.resolve()
      .then(() => this.fake.onQuery(this.q))
      .then(onfulfilled, onrejected)
  }
}

export interface FakeBinding {
  type: string
  filter: { event: string; schema: string; table?: string }
  callback: (payload: unknown) => void
}

export class FakeChannel {
  readonly topic: string
  readonly bindings: FakeBinding[] = []
  statusCallback: ((status: string, err?: Error) => void) | null = null
  removed = false

  constructor(topic: string) {
    this.topic = topic
  }
  on(type: string, filter: FakeBinding['filter'], callback: (payload: unknown) => void) {
    this.bindings.push({ type, filter, callback })
    return this
  }
  subscribe(cb?: (status: string, err?: Error) => void) {
    this.statusCallback = cb ?? null
    return this
  }
  /** Simulates a server status (SUBSCRIBED / CHANNEL_ERROR / CLOSED …). */
  setStatus(status: string) {
    this.statusCallback?.(status)
  }
  /** Simulates a postgres_changes event. */
  emit(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', newRow: unknown, oldRow: unknown = {}) {
    for (const b of this.bindings) {
      if (b.type !== 'postgres_changes' || b.filter.table !== table) continue
      if (b.filter.event !== '*' && b.filter.event !== eventType) continue
      b.callback({ schema: 'public', table, eventType, new: newRow, old: oldRow, commit_timestamp: '', errors: [] })
    }
  }
}

export interface FakeSupabase {
  client: unknown
  calls: string[]
  queries: RecordedQuery[]
  rpcCalls: Array<{ name: string; args: unknown }>
  /** RPC name → handler. Unknown RPCs resolve { data: null }. */
  rpc: Record<string, Handler<unknown>>
  onQuery: Handler<RecordedQuery>
  channels: FakeChannel[]
  storage: {
    upload: ReturnType<typeof vi.fn<(path: string, body: Blob, opts?: unknown) => Promise<FakeResult>>>
    createSignedUrl: ReturnType<typeof vi.fn<(path: string, expiresIn: number) => Promise<FakeResult>>>
    buckets: string[]
  }
  auth: {
    session: { user: { id: string } } | null
    getSession: ReturnType<typeof vi.fn<() => Promise<FakeResult>>>
    signInAnonymously: ReturnType<typeof vi.fn<() => Promise<FakeResult>>>
    signOut: ReturnType<typeof vi.fn<(opts?: unknown) => Promise<{ error: unknown }>>>
    listeners: Array<(event: string, session: unknown) => void>
    emit(event: string, session: unknown): void
  }
  /** The last channel created. */
  lastChannel(): FakeChannel
}

export function createFakeSupabase(): FakeSupabase {
  const fake = {} as FakeSupabase
  fake.calls = []
  fake.queries = []
  fake.rpcCalls = []
  fake.rpc = {}
  fake.onQuery = () => ok([])
  fake.channels = []

  const upload = vi.fn((path: string, body: Blob, opts?: unknown) => {
    void body
    void opts
    fake.calls.push(`upload:${path}`)
    return Promise.resolve(ok({ id: 'obj', path, fullPath: `chat-audio/${path}` }))
  })
  const createSignedUrl = vi.fn((path: string, expiresIn: number) => {
    fake.calls.push(`sign:${path}`)
    return Promise.resolve(ok({ signedUrl: `https://example.test/signed/${path}?e=${expiresIn}` }))
  })
  fake.storage = { upload, createSignedUrl, buckets: [] }

  const auth: FakeSupabase['auth'] = {
    session: null,
    listeners: [],
    getSession: vi.fn(() => Promise.resolve({ data: { session: auth.session }, error: null })),
    signInAnonymously: vi.fn(() => {
      auth.session = { user: { id: '00000000-0000-4000-8000-00000000a001' } }
      return Promise.resolve({ data: { user: auth.session.user, session: auth.session }, error: null })
    }),
    signOut: vi.fn(() => {
      auth.session = null
      auth.emit('SIGNED_OUT', null)
      return Promise.resolve({ error: null })
    }),
    emit(event, session) {
      for (const l of auth.listeners) l(event, session)
    },
  }
  fake.auth = auth

  fake.lastChannel = () => {
    const ch = fake.channels[fake.channels.length - 1]
    if (!ch) throw new Error('no channel')
    return ch
  }

  fake.client = {
    rpc: (name: string, args?: unknown) => {
      fake.rpcCalls.push({ name, args })
      fake.calls.push(`rpc:${name}`)
      const handler = fake.rpc[name]
      return Promise.resolve().then(() => (handler ? handler(args) : ok(null)))
    },
    from: (table: string) => new FakeQuery(fake, table),
    storage: {
      from: (bucket: string) => {
        fake.storage.buckets.push(bucket)
        return { upload, createSignedUrl }
      },
    },
    auth: {
      getSession: auth.getSession,
      signInAnonymously: auth.signInAnonymously,
      signOut: auth.signOut,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listeners.push(cb)
        return { data: { subscription: { unsubscribe: () => (auth.listeners = auth.listeners.filter((l) => l !== cb)) } } }
      },
    },
    channel: (topic: string) => {
      const ch = new FakeChannel(topic)
      fake.channels.push(ch)
      return ch
    },
    removeChannel: (ch: FakeChannel) => {
      ch.removed = true
      return Promise.resolve('ok')
    },
  }
  return fake
}

// ---------------------------------------------------------------------------
// Fixtures (rows as PostgREST / Realtime deliver them)
// ---------------------------------------------------------------------------

/** Deterministic lower-case uuid v4-shaped ids: uid(1) → 00000000-0000-4000-8000-000000000001. */
export const uid = (n: number | string): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const ME = uid('a001')
export const OTHER = uid('b002')
export const THIRD = uid('c003')
export const DIRECT = uid('d001')
export const GROUP = uid('e001')

/** Server-style timestamp with microseconds: ts(5) → 2026-09-26T10:00:05.000000+00:00 (+µs). */
export const ts = (seconds: number, micros = 0): string =>
  `2026-09-26T10:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(micros).padStart(6, '0')}+00:00`

export function profileRow(id: string, publicId: number, name: string, role = 'student') {
  return { id, public_id: publicId, display_name: name, role }
}

export function myProfileRow(over: Record<string, unknown> = {}) {
  return {
    id: ME,
    public_id: 7,
    display_name: 'Ana',
    role: 'student',
    monitor_status: null,
    can_manage_groups: false,
    my_language: 'pt-PT',
    app_language: 'pt-PT',
    country_code: 'IT',
    city: 'Milano',
    created_at: ts(0),
    updated_at: ts(0),
    ...over,
  }
}

export function textRow(id: string, conversationId: string, senderId: string, createdAt: string, body = 'olá') {
  return { id, conversation_id: conversationId, sender_id: senderId, kind: 'text', body, audio_path: null, audio_duration_ms: null, audio_mime: null, created_at: createdAt }
}

export function conversationRow(over: Record<string, unknown> = {}) {
  return {
    id: DIRECT,
    kind: 'direct',
    name: null,
    allow_leave: true,
    archived_at: null,
    my_role: 'member',
    members_count: 2,
    other_user: profileRow(OTHER, 2, 'Bruno', 'monitor'),
    last_message: null,
    unread_count: 0,
    last_message_at: null,
    created_at: ts(0),
    ...over,
  }
}

export function groupRow(over: Record<string, unknown> = {}) {
  return conversationRow({ id: GROUP, kind: 'group', name: 'Erasmus Milano', other_user: null, members_count: 3, ...over })
}

export function memberRow(userId: string, publicId: number, name: string, lastReadAt: string, over: Record<string, unknown> = {}) {
  return { user_id: userId, public_id: publicId, display_name: name, role: 'student', member_role: 'member', joined_at: ts(0), last_read_at: lastReadAt, ...over }
}

export const okResult = (data: unknown): FakeResult => ({ data, error: null, status: 200 })

// ---------------------------------------------------------------------------
// App state helpers
// ---------------------------------------------------------------------------

/** Completes the local onboarding exactly like myProfileRow() (so no upsert is needed). */
export function onboardLocalProfile(name = 'Ana', role: 'student' | 'monitor' = 'student'): void {
  useSettingsStore.getState().setAppLanguage('pt-PT')
  const p = useProfileStore.getState()
  p.setName(name)
  p.setRole(role)
  p.setMyLanguage('pt-PT')
  p.setLocation({ countryCode: 'IT', city: { name: 'Milano' } })
  p.completeOnboarding()
}

export function resetChatTestState(): void {
  disposeChat()
  useProfileStore.getState().reset()
  useSettingsStore.getState().reset()
  localStorage.clear()
}

async function until(check: () => boolean, what: string): Promise<void> {
  await vi.waitFor(() => {
    if (!check()) throw new Error(`timed out waiting for ${what}`)
  })
}

/** Onboarded user with a stored session → chat 'ready' with the conversation list loaded. */
export async function bootReady(fake: FakeSupabase, opts: { conversations?: unknown[]; me?: Record<string, unknown> } = {}): Promise<void> {
  onboardLocalProfile()
  fake.auth.session = { user: { id: ME } }
  fake.rpc.get_my_profile ??= () => okResult([myProfileRow(opts.me)])
  fake.rpc.list_my_conversations ??= () => okResult(opts.conversations ?? [])
  startChat()
  await until(() => useChatStore.getState().session.status === 'ready', 'session ready')
  await until(() => useChatStore.getState().list.status === 'success', 'conversation list')
}
