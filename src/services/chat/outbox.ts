/**
 * Outgoing messages: optimistic insert → persist → 'sent' (or 'failed' + retry / discard).
 *
 * - Ids are client-generated (crypto.randomUUID) so a retry of a message that actually landed is a
 *   no-op server-side (insertMessage returns the stored row on 23505).
 * - Audio: upload FIRST (plain content type, path `{conversationId}/{messageId}.{ext}`), then insert the
 *   row (RLS checks the object exists and is mine). A failed insert after a successful upload retries
 *   only the insert; the blob stays in memory until the message is sent or discarded.
 * - Failures never reject sendText/sendAudio: the bubble turns 'failed'. Only validation throws.
 */
import { AppError } from '@/services/errors'
import { baseMimeType, type RecordedAudio } from '@/services/audio'
import { addConfirmedMessages, addPending, applyMessageToSummary, findPending, removePending, setPendingStatus, useChatStore } from './chatStore'
import { ChatError } from './errors'
import { isChatAudioMime, validateMessageText } from './mappers'
import { insertMessage, uploadAudio } from './repository'
import { getGeneration, isOffline, requireReadyUser } from './runtime'
import { CHAT_LIMITS, type AudioChatMessage, type ChatAudioMimeType, type ChatMessage, type TextChatMessage } from './types'

interface AudioPayload {
  blob: Blob
  mime: ChatAudioMimeType
  uploaded: boolean
}

const audioPayloads = new Map<string, AudioPayload>()
/** Local object URLs of audio I recorded (instant playback, no download), by storage path. */
const localAudioUrls = new Map<string, string>()
const inFlight = new Set<string>()

const EXTENSIONS: Record<ChatAudioMimeType, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
}

export function getLocalAudioUrl(path: string): string | null {
  return localAudioUrls.get(path) ?? null
}

function newId(): string {
  return crypto.randomUUID()
}

/** Posting is blocked in archived conversations (the server would reject it anyway). */
function assertCanPost(conversationId: string): void {
  const summary = useChatStore.getState().list.byId[conversationId]
  if (!summary) throw new ChatError('not-found', 'not_found')
  if (summary.archivedAt) throw new ChatError('permission-denied', 'archived')
}

async function deliver(msg: ChatMessage): Promise<void> {
  if (inFlight.has(msg.id)) return
  inFlight.add(msg.id)
  const gen = getGeneration()
  try {
    if (isOffline()) throw new AppError('offline')
    let saved: ChatMessage
    if (msg.kind === 'audio') {
      const payload = audioPayloads.get(msg.id)
      if (!payload) throw new ChatError('invalid-input')
      if (!payload.uploaded) {
        await uploadAudio(msg.audioPath, payload.blob, payload.mime)
        payload.uploaded = true
      }
      if (gen !== getGeneration()) return
      saved = await insertMessage({
        id: msg.id,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        kind: 'audio',
        audioPath: msg.audioPath,
        audioDurationMs: msg.audioDurationMs,
        audioMime: msg.audioMime,
      })
    } else {
      saved = await insertMessage({ id: msg.id, conversationId: msg.conversationId, senderId: msg.senderId, kind: 'text', body: msg.body })
    }
    if (gen !== getGeneration()) return
    audioPayloads.delete(msg.id)
    addConfirmedMessages(msg.conversationId, [saved])
    applyMessageToSummary(saved, msg.senderId)
  } catch {
    if (gen !== getGeneration()) return
    // Stays in the thread as 'failed' (retry / discard). The reason is not shown per bubble.
    setPendingStatus(msg.conversationId, msg.id, 'failed')
  } finally {
    inFlight.delete(msg.id)
  }
}

export async function sendText(conversationId: string, raw: string): Promise<void> {
  const body = validateMessageText(raw)
  const senderId = requireReadyUser()
  assertCanPost(conversationId)
  const msg: TextChatMessage = { id: newId(), conversationId, senderId, createdAt: new Date().toISOString(), status: 'sending', kind: 'text', body }
  addPending(msg)
  await deliver(msg)
}

export async function sendAudio(conversationId: string, audio: RecordedAudio): Promise<void> {
  const mime = baseMimeType(audio.mimeType)
  if (!isChatAudioMime(mime)) throw new ChatError('invalid-input', 'invalid_input')
  const size = audio.blob.size
  if (!(size > 0 && size <= CHAT_LIMITS.audioMaxBytes)) throw new ChatError('invalid-input', 'invalid_input')
  const audioDurationMs = Math.round(audio.durationMs)
  if (!(audioDurationMs >= 1 && audioDurationMs <= CHAT_LIMITS.audioMaxDurationMs)) throw new ChatError('invalid-input', 'invalid_input')
  const senderId = requireReadyUser()
  assertCanPost(conversationId)

  const id = newId()
  const audioPath = `${conversationId}/${id}.${EXTENSIONS[mime]}`
  audioPayloads.set(id, { blob: audio.blob, mime, uploaded: false })
  try {
    localAudioUrls.set(audioPath, URL.createObjectURL(audio.blob))
  } catch {
    // no object URLs here: playback falls back to a signed URL once sent
  }
  const msg: AudioChatMessage = { id, conversationId, senderId, createdAt: new Date().toISOString(), status: 'sending', kind: 'audio', audioPath, audioDurationMs, audioMime: mime }
  addPending(msg)
  await deliver(msg)
}

/** Retries a failed message (no-op for anything else). */
export async function retryMessage(conversationId: string, id: string): Promise<void> {
  const msg = findPending(conversationId, id)
  if (!msg || msg.status !== 'failed' || inFlight.has(id)) return
  requireReadyUser()
  setPendingStatus(conversationId, id, 'sending')
  await deliver({ ...msg, status: 'sending' })
}

/** Removes a failed optimistic message (an already-uploaded audio object stays orphaned in storage). */
export function discardMessage(conversationId: string, id: string): void {
  const msg = findPending(conversationId, id)
  if (!msg || msg.status !== 'failed') return
  removePending(conversationId, id)
  audioPayloads.delete(id)
  if (msg.kind === 'audio') revokeLocalUrl(msg.audioPath)
}

function revokeLocalUrl(path: string): void {
  const url = localAudioUrls.get(path)
  localAudioUrls.delete(path)
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

/** Drops every pending payload and local URL (sign-out / identity change). */
export function clearOutbox(): void {
  audioPayloads.clear()
  inFlight.clear()
  for (const path of [...localAudioUrls.keys()]) revokeLocalUrl(path)
}
