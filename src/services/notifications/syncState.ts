import { create } from 'zustand'

/**
 * Outcome of the last attempt to register this device's push subscription (see hooks/usePushSync). In memory only:
 * the real state is always re-derived on start. The permissions screen reads it and offers a retry.
 */
export type PushSyncStatus = 'idle' | 'syncing' | 'registered' | 'failed'

interface PushSyncState {
  status: PushSyncStatus
  /** Bumped by retry() so the sync effect runs again. */
  attempt: number
  setStatus: (status: PushSyncStatus) => void
  retry: () => void
}

export const usePushSyncStore = create<PushSyncState>()((set) => ({
  status: 'idle',
  attempt: 0,
  setStatus: (status) => set({ status }),
  retry: () => set((s) => ({ attempt: s.attempt + 1 })),
}))
