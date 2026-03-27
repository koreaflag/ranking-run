import { create } from 'zustand';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncPendingData, hasPendingData } from '../services/pendingSyncService';

interface NetworkStore {
  /** True when the device has internet connectivity */
  isOnline: boolean;
  /** Number of pending items waiting to sync */
  pendingCount: number;
  /** True while a sync is in progress */
  isSyncing: boolean;
  /** Subscribe to NetInfo events — call once on app mount */
  startListening: () => () => void;
  /** Manually trigger a sync attempt */
  triggerSync: () => Promise<void>;
  /** Refresh pending count from AsyncStorage */
  refreshPendingCount: () => Promise<void>;
}

// Backoff state (module-level, not in store to avoid re-renders)
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RETRY = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;

// Module-level sync lock to prevent concurrent triggerSync calls
let syncLock = false;

function getBackoffDelay(): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,

  startListening: () => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = get().isOnline;
      const nowOnline = state.isConnected === true && state.isInternetReachable !== false;

      set({ isOnline: nowOnline });

      // Network recovered — attempt sync
      if (!wasOnline && nowOnline) {
        retryCount = 0;
        clearRetryTimer();
        get().triggerSync().catch(() => {});
      }
    });

    // Initial pending count
    get().refreshPendingCount().catch(() => {});

    // Return cleanup that also clears pending retry timer
    return () => {
      unsubscribe();
      clearRetryTimer();
    };
  },

  triggerSync: async () => {
    const { isOnline } = get();
    if (!isOnline || syncLock) return;

    const hasPending = await hasPendingData();
    if (!hasPending) {
      set({ pendingCount: 0 });
      retryCount = 0;
      return;
    }

    syncLock = true;
    set({ isSyncing: true });
    try {
      await syncPendingData();
      retryCount = 0;

      // Refresh count after sync
      await get().refreshPendingCount();

      // If there are still pending items, schedule a retry
      const stillPending = await hasPendingData();
      if (stillPending && retryCount < MAX_RETRY) {
        retryCount++;
        const delay = getBackoffDelay();
        retryTimer = setTimeout(() => {
          retryTimer = null;
          get().triggerSync().catch(() => {});
        }, delay);
      }
    } catch {
      // Sync failed — schedule backoff retry
      if (retryCount < MAX_RETRY) {
        retryCount++;
        const delay = getBackoffDelay();
        retryTimer = setTimeout(() => {
          retryTimer = null;
          get().triggerSync().catch(() => {});
        }, delay);
      }
    } finally {
      syncLock = false;
      set({ isSyncing: false });
    }
  },

  refreshPendingCount: async () => {
    try {
      const [profile, courses, runs, chunks] = await Promise.all([
        AsyncStorage.getItem('@pending_sync:profile'),
        AsyncStorage.getItem('@pending_sync:courses'),
        AsyncStorage.getItem('@pending_sync:runs'),
        AsyncStorage.getItem('@pending_sync:chunks'),
      ]);
      let count = 0;
      if (profile) count++;
      if (courses) {
        try {
          count += JSON.parse(courses).length;
        } catch (e) {
          if (__DEV__) console.warn('[networkStore] corrupt pending courses data', e);
        }
      }
      if (runs) {
        try {
          count += JSON.parse(runs).length;
        } catch (e) {
          if (__DEV__) console.warn('[networkStore] corrupt pending runs data', e);
        }
      }
      if (chunks) {
        try {
          count += JSON.parse(chunks).length;
        } catch (e) {
          if (__DEV__) console.warn('[networkStore] corrupt pending chunks data', e);
        }
      }
      set({ pendingCount: count });
    } catch {
      // AsyncStorage read failed — ignore
    }
  },
}));
