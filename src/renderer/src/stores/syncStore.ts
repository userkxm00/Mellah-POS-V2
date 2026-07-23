import { create } from 'zustand'

interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  lastSyncedAt: string | null
  setOnlineStatus: (isOnline: boolean) => void
  setSyncing: (isSyncing: boolean) => void
  setPendingCount: (count: number) => void
  setLastSyncedAt: (timestamp: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,

  setOnlineStatus: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),
}))
