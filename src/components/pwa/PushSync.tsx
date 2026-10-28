import { usePushSync } from '@/hooks/usePushSync'

/** Renders nothing: mounts usePushSync (lazy in AppLayout, together with the chat session it depends on). */
export function PushSync() {
  usePushSync()
  return null
}
