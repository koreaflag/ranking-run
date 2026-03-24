import { create } from 'zustand';
import {
  liveGroupRunService,
  type LiveGroupRunListItem,
  type LiveGroupRunDetail,
  type LiveGroupRunParticipant,
  type LiveGroupRunCreateRequest,
} from '../services/liveGroupRunService';

interface LiveGroupRunState {
  // List
  groupRuns: LiveGroupRunListItem[];
  isLoadingList: boolean;

  // Detail
  selectedGroupRun: LiveGroupRunDetail | null;
  isLoadingDetail: boolean;

  // WebSocket
  wsConnected: boolean;
  participants: LiveGroupRunParticipant[];

  // Actions
  fetchGroupRuns: () => Promise<void>;
  fetchGroupRunDetail: (id: string) => Promise<void>;
  createGroupRun: (req: LiveGroupRunCreateRequest) => Promise<string>;
  joinGroupRun: (id: string) => Promise<void>;
  startGroupRun: (id: string) => Promise<void>;

  // WebSocket state
  setWsConnected: (connected: boolean) => void;
  updateParticipants: (participants: LiveGroupRunParticipant[]) => void;
  updateGroupRunStatus: (status: LiveGroupRunDetail['status']) => void;
  markParticipantCompleted: (userId: string) => void;
  reset: () => void;
}

export const useLiveGroupRunStore = create<LiveGroupRunState>((set, get) => ({
  groupRuns: [],
  isLoadingList: false,
  selectedGroupRun: null,
  isLoadingDetail: false,
  wsConnected: false,
  participants: [],

  fetchGroupRuns: async () => {
    set({ isLoadingList: true });
    try {
      const response = await liveGroupRunService.list();
      set({ groupRuns: response.items });
    } catch (err) {
      console.warn('[liveGroupRunStore] fetchGroupRuns error:', err);
    } finally {
      set({ isLoadingList: false });
    }
  },

  fetchGroupRunDetail: async (id: string) => {
    set({ isLoadingDetail: true });
    try {
      const detail = await liveGroupRunService.getDetail(id);
      set({
        selectedGroupRun: detail,
        participants: detail.participants,
      });
    } catch (err) {
      console.warn('[liveGroupRunStore] fetchGroupRunDetail error:', err);
      throw err;
    } finally {
      set({ isLoadingDetail: false });
    }
  },

  createGroupRun: async (req: LiveGroupRunCreateRequest) => {
    const response = await liveGroupRunService.create(req);
    // Refresh list after creation
    get().fetchGroupRuns();
    return response.id;
  },

  joinGroupRun: async (id: string) => {
    await liveGroupRunService.join(id);
    // Refresh detail after joining
    await get().fetchGroupRunDetail(id);
  },

  startGroupRun: async (id: string) => {
    await liveGroupRunService.start(id);
  },

  setWsConnected: (connected: boolean) => {
    set({ wsConnected: connected });
  },

  updateParticipants: (participants: LiveGroupRunParticipant[]) => {
    set({ participants });
  },

  updateGroupRunStatus: (status: LiveGroupRunDetail['status']) => {
    const current = get().selectedGroupRun;
    if (current) {
      set({ selectedGroupRun: { ...current, status } });
    }
  },

  markParticipantCompleted: (userId: string) => {
    set((state) => ({
      participants: state.participants.map((p) =>
        p.user_id === userId ? { ...p, status: 'completed' as const } : p,
      ),
    }));
  },

  reset: () => {
    set({
      groupRuns: [],
      isLoadingList: false,
      selectedGroupRun: null,
      isLoadingDetail: false,
      wsConnected: false,
      participants: [],
    });
  },
}));
