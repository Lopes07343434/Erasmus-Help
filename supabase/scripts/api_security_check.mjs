#!/usr/bin/env node
// =============================================================================
// Erasmus Help — end-to-end security check through the REAL HTTP API (PostgREST + Storage),
// the way the app talks to Supabase (supabase-js, publishable key, anonymous sessions).
//
// Three anonymous users A, B, C create profiles; A opens a direct conversation with B, sends a
// message, uploads an audio file and a profile photo, creates a group with B. Then C (a stranger)
// tries to read or write all of it, and every attempt must come back empty / denied.
//
// Usage (local stack running; from the repo root):
//   node supabase/scripts/api_security_check.mjs
// Config: API_URL, PUBLISHABLE_KEY (or ANON_KEY) and, for the cleanup, SECRET_KEY (or
// SERVICE_ROLE_KEY) from the environment; when missing they are read from
// `supabase status -o env` (SUPABASE_BIN, default `npx supabase`). Keys are never printed.
//
// Cost: 3 anonymous sign-ins (local limit: 30/hour/IP) and 3 public IDs (never reused, by design).
// Cleanup: with the secret key the 3 users and their files are deleted; otherwise they stay.
// Exit code: 0 = all checks passed, 1 = a check failed, 2 = setup error.
// =============================================================================
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function loadConfig() {
  let env = { ...process.env }
  if (!env.API_URL || !(env.PUBLISHABLE_KEY || env.ANON_KEY)) {
    const bin = env.SUPABASE_BIN ? [env.SUPABASE_BIN] : ['npx', 'supabase']
    const out = execFileSync(bin[0], [...bin.slice(1), 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const line of out.split('\n')) {
      const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
      if (m && !env[m[1]]) env[m[1]] = m[2]
    }
  }
  const url = env.API_URL
  const key = env.PUBLISHABLE_KEY || env.ANON_KEY
  if (!url || !key) throw new Error('API_URL / PUBLISHABLE_KEY not found')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && env.FORCE !== '1') {
    throw new Error(`refusing to run against ${url} (local stack only; FORCE=1 to override)`)
  }
  return { url, key, secret: env.SECRET_KEY || env.SERVICE_ROLE_KEY || null }
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  → ${detail}` : ''}`)
}
const brief = (x) => {
  try {
    return JSON.stringify(x)?.slice(0, 200)
  } catch {
    return String(x)
  }
}
// The request succeeded and returned no rows.
function expectEmpty(name, { data, error }) {
  record(name, !error && Array.isArray(data) && data.length === 0, error ? `error ${error.code}: ${error.message}` : `data ${brief(data)}`)
}
// The request failed with this Postgres error code (and, optionally, this message).
function expectError(name, { data, error }, code, message) {
  const ok = !!error && error.code === code && (message === undefined || error.message === message)
  record(name, ok, error ? `error ${error.code}: ${error.message}` : `no error, data ${brief(data)}`)
}
// Storage API refused the operation.
function expectStorageDenied(name, { data, error }) {
  record(name, !!error && !data, error ? '' : `no error, data ${brief(data)}`)
}
function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.code ?? error.statusCode ?? ''} ${error.message}`)
  return data
}

const { url, key, secret } = loadConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const newClient = () => createClient(url, key, clientOptions)

const users = {}
const cleanupObjects = { 'chat-audio': [], avatars: [] }

async function signUp(label) {
  const client = newClient()
  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw new Error(`anonymous sign-in ${label}: ${error.message}`)
  const profile = must(
    await client.rpc('upsert_my_profile', { p_display_name: `API Check ${label} ${Date.now() % 100000}`, p_role: 'student' }),
    `upsert_my_profile ${label}`,
  )
  users[label] = { client, id: data.user.id, publicId: profile.public_id, name: profile.display_name }
  return users[label]
}

async function main() {
  console.log(`API security check against ${url}`)

  // ---- Setup -------------------------------------------------------------------------------------
  const A = await signUp('A')
  const B = await signUp('B')
  const C = await signUp('C')
  console.log(`setup: A=ID ${A.publicId}, B=ID ${B.publicId}, C=ID ${C.publicId}`)

  const dm = must(await A.client.rpc('start_direct_conversation', { p_public_id: B.publicId }), 'start_direct_conversation')
  must(
    await A.client.from('messages').insert({ id: randomUUID(), conversation_id: dm, sender_id: A.id, kind: 'text', body: 'Olá B (API check)' }),
    'send message',
  )
  const audioPath = `${dm}/${randomUUID()}.webm`
  must(
    await A.client.storage.from('chat-audio').upload(audioPath, new Blob([new Uint8Array(64)], { type: 'audio/webm' }), { contentType: 'audio/webm' }),
    'upload audio',
  )
  cleanupObjects['chat-audio'].push(audioPath)
  const avatarPath = `users/${A.id}/${randomUUID()}.jpg`
  must(
    await A.client.storage.from('avatars').upload(avatarPath, new Blob([new Uint8Array(64)], { type: 'image/jpeg' }), { contentType: 'image/jpeg' }),
    'upload avatar',
  )
  cleanupObjects.avatars.push(avatarPath)
  must(await A.client.rpc('set_my_avatar', { p_path: avatarPath }), 'set_my_avatar')
  const group = must(await A.client.rpc('create_group', { p_name: 'API check group', p_member_public_ids: [B.publicId] }), 'create_group')

  // ---- Positive controls (the setup really works) --------------------------------------------------
  console.log('controls (members):')
  {
    const r = await B.client.from('messages').select('id, body').eq('conversation_id', dm)
    record('B (member) reads the message A sent', !r.error && r.data?.length === 1, brief(r.error ?? r.data))
    const again = await B.client.rpc('start_direct_conversation', { p_public_id: A.publicId })
    record('B gets the same direct conversation (idempotent)', again.data === dm, brief(again.error ?? again.data))
    const signed = await B.client.storage.from('chat-audio').createSignedUrl(audioPath, 60)
    record('B (member) can get a signed URL for the audio', !signed.error && !!signed.data?.signedUrl, brief(signed.error))
    const members = await B.client.rpc('list_conversation_members', { p_conversation: group })
    record('B (member) lists the group members', !members.error && members.data?.length === 2, brief(members.error ?? members.data))
  }

  // ---- C, a stranger ------------------------------------------------------------------------------
  console.log('C (not a member) — tables:')
  expectEmpty('C cannot read A–B messages', await C.client.from('messages').select('id, body').eq('conversation_id', dm))
  expectEmpty('C cannot read any message at all', await C.client.from('messages').select('id'))
  expectEmpty('C cannot see the A–B conversation', await C.client.from('conversations').select('id').eq('id', dm))
  expectEmpty('C cannot see the group', await C.client.from('conversations').select('id').eq('id', group))
  expectEmpty('C cannot see A–B members', await C.client.from('conversation_members').select('user_id').eq('conversation_id', dm))
  expectEmpty("C cannot read A's or B's profile row", await C.client.from('profiles').select('id, display_name').in('id', [A.id, B.id]))
  expectError(
    'C cannot insert a message into A–B',
    await C.client.from('messages').insert({ id: randomUUID(), conversation_id: dm, sender_id: C.id, kind: 'text', body: 'intrusion' }),
    '42501',
  )
  expectError(
    'C cannot insert a message as A',
    await C.client.from('messages').insert({ id: randomUUID(), conversation_id: dm, sender_id: A.id, kind: 'text', body: 'spoof' }),
    '42501',
  )
  expectError(
    'C cannot add themself to conversation_members',
    await C.client.from('conversation_members').insert({ conversation_id: group, user_id: C.id }),
    '42501',
  )
  {
    const r = await C.client.from('profiles').update({ display_name: 'Hacked' }).eq('id', A.id).select('id')
    record('C cannot rename A (0 rows updated)', !r.error && r.data?.length === 0, brief(r.error ?? r.data))
  }

  console.log('C (not a member) — RPCs:')
  expectError('list_conversation_members(A–B) → not_found', await C.client.rpc('list_conversation_members', { p_conversation: dm }), 'P0001', 'not_found')
  expectError('mark_conversation_read(A–B) → not_found', await C.client.rpc('mark_conversation_read', { p_conversation: dm }), 'P0001', 'not_found')
  expectError(
    "add_group_member(A's group, C) → not_found",
    await C.client.rpc('add_group_member', { p_conversation: group, p_public_id: C.publicId }),
    'P0001',
    'not_found',
  )
  expectError(
    'add_group_member(A–B direct, C) → not_found',
    await C.client.rpc('add_group_member', { p_conversation: dm, p_public_id: C.publicId }),
    'P0001',
    'not_found',
  )
  expectError(
    "set_group_member_role(A's group, C, manager) → not_found",
    await C.client.rpc('set_group_member_role', { p_conversation: group, p_user_id: C.id, p_role: 'manager' }),
    'P0001',
    'not_found',
  )
  expectError("rename_group(A's group) → not_found", await C.client.rpc('rename_group', { p_conversation: group, p_name: 'Hacked' }), 'P0001', 'not_found')
  expectError("leave_group(A's group) → not_found", await C.client.rpc('leave_group', { p_conversation: group }), 'P0001', 'not_found')
  expectError("set_group_avatar(A's group) → not_found", await C.client.rpc('set_group_avatar', { p_conversation: group, p_path: null }), 'P0001', 'not_found')
  expectError("delete_group(A's group) → not_found", await C.client.rpc('delete_group', { p_conversation: group }), 'P0001', 'not_found')
  expectEmpty('list_my_conversations → nothing of A/B', await C.client.rpc('list_my_conversations', { p_include_archived: true }))
  {
    const r = await C.client.rpc('search_profiles', { p_query: String(A.publicId) })
    const row = r.data?.find((x) => x.id === A.id)
    const keys = row ? Object.keys(row).sort().join(',') : ''
    record(
      'directory: C finds A by ID with public fields only',
      !r.error && keys === 'avatar_path,display_name,exact_id_match,id,public_id,role' && row.exact_id_match === true,
      brief(r.error ?? r.data),
    )
    const own = await C.client.rpc('search_profiles', { p_query: String(C.publicId) })
    record('directory: C never finds themself', !own.error && !own.data?.some((x) => x.id === C.id), brief(own.error ?? own.data))
  }

  console.log('C (not a member) — Storage:')
  {
    const list = await C.client.storage.from('chat-audio').list(dm)
    record("C cannot list the conversation's audio folder", !list.error ? list.data?.length === 0 : true, brief(list.error ?? list.data))
    expectStorageDenied('C cannot get a signed URL for A–B audio', await C.client.storage.from('chat-audio').createSignedUrl(audioPath, 60))
    expectStorageDenied('C cannot download A–B audio', await C.client.storage.from('chat-audio').download(audioPath))
    expectStorageDenied(
      'C cannot upload audio into A–B',
      await C.client.storage.from('chat-audio').upload(`${dm}/${randomUUID()}.webm`, new Blob([new Uint8Array(8)], { type: 'audio/webm' }), {
        contentType: 'audio/webm',
      }),
    )
    expectStorageDenied(
      "C cannot upload into A's avatar folder",
      await C.client.storage.from('avatars').upload(`users/${A.id}/${randomUUID()}.jpg`, new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), {
        contentType: 'image/jpeg',
      }),
    )
    const avatarList = await C.client.storage.from('avatars').list(`users/${A.id}`)
    record("C cannot list A's avatar folder", !avatarList.error ? avatarList.data?.length === 0 : true, brief(avatarList.error ?? avatarList.data))
    await C.client.storage.from('avatars').remove([avatarPath])
    const stillThere = await A.client.storage.from('avatars').list(`users/${A.id}`)
    record("C cannot delete A's photo", !stillThere.error && stillThere.data?.length === 1, brief(stillThere.error ?? stillThere.data))
    expectError("set_my_avatar(A's photo) as C → invalid_input", await C.client.rpc('set_my_avatar', { p_path: avatarPath }), 'P0001', 'invalid_input')
  }

  console.log('column privileges / no session:')
  expectError('A: profiles select(*) fails (column privileges)', await A.client.from('profiles').select('*').eq('id', A.id), '42501')
  expectError('A: profiles select(city) fails', await A.client.from('profiles').select('id, city').eq('id', A.id), '42501')
  {
    const own = await A.client.rpc('get_my_profile').maybeSingle()
    record('A: get_my_profile returns the full own row', !own.error && own.data?.id === A.id && own.data?.avatar_path === avatarPath, brief(own.error))
  }
  const anon = newClient()
  {
    const r = await anon.rpc('search_profiles', { p_query: 'API' })
    record('no session: search_profiles refused', !!r.error, brief(r.data))
    const m = await anon.from('messages').select('id')
    record('no session: messages not readable', !!m.error || m.data?.length === 0, brief(m.data))
    const p = await anon.from('profiles').select('id')
    record('no session: profiles not readable', !!p.error || p.data?.length === 0, brief(p.data))
  }
}

async function cleanup() {
  if (!secret) {
    console.log('cleanup: SECRET_KEY not available → the 3 test users and their files were left in place')
    return
  }
  const admin = createClient(url, secret, clientOptions)
  for (const [bucket, paths] of Object.entries(cleanupObjects)) {
    if (paths.length) await admin.storage.from(bucket).remove(paths)
  }
  let deleted = 0
  for (const u of Object.values(users)) {
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (!error) deleted += 1
  }
  console.log(`cleanup: ${deleted} test user(s) and their files deleted (their public IDs are not reused, by design)`)
}

let exitCode = 0
try {
  await main()
} catch (err) {
  console.error(`setup error: ${err.message}`)
  exitCode = 2
} finally {
  try {
    await cleanup()
  } catch (err) {
    console.error(`cleanup error: ${err.message}`)
  }
}
const failed = results.filter((r) => !r.ok).length
if (exitCode === 0) {
  console.log(`\nRESULT: ${failed === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed}/${results.length} checks passed`)
  if (failed) exitCode = 1
}
process.exit(exitCode)
