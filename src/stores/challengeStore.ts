import { create } from 'zustand';
import {
  challengeService,
  type ChallengeListItem,
  type ChallengeDetail,
  type ChallengeType,
} from '../services/challengeService';

interface ChallengeState {
  // List
  challenges: ChallengeListItem[];
  isLoading: boolean;
  error: string | null;

  // Filter
  filterType: ChallengeType | 'all';

  // Detail
  selectedChallenge: ChallengeDetail | null;
  isLoadingDetail: boolean;

  // Join
  isJoining: boolean;

  // Actions
  setFilterType: (type: ChallengeType | 'all') => void;
  fetchChallenges: () => Promise<void>;
  fetchChallengeDetail: (challengeId: string) => Promise<void>;
  joinChallenge: (challengeId: string) => Promise<void>;
  clearError: () => void;
}

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  challenges: [],
  isLoading: false,
  error: null,

  filterType: 'all',

  selectedChallenge: null,
  isLoadingDetail: false,

  isJoining: false,

  setFilterType: (type) => {
    set({ filterType: type });
  },

  fetchChallenges: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await challengeService.getChallenges();
      set({ challenges: response.items, isLoading: false });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load challenges';
      set({ isLoading: false, error: message });
    }
  },

  fetchChallengeDetail: async (challengeId: string) => {
    set({ isLoadingDetail: true, selectedChallenge: null });
    try {
      const detail = await challengeService.getChallengeDetail(challengeId);
      set({ selectedChallenge: detail, isLoadingDetail: false });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load challenge';
      set({ isLoadingDetail: false, error: message });
    }
  },

  joinChallenge: async (challengeId: string) => {
    set({ isJoining: true });
    try {
      await challengeService.joinChallenge(challengeId);
      // Update list item
      set((state) => ({
        challenges: state.challenges.map((c) =>
          c.id === challengeId
            ? { ...c, is_joined: true, participant_count: c.participant_count + 1 }
            : c,
        ),
        isJoining: false,
      }));
      // Refresh detail if viewing the same challenge
      const { selectedChallenge } = get();
      if (selectedChallenge?.id === challengeId) {
        get().fetchChallengeDetail(challengeId);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to join challenge';
      set({ isJoining: false, error: message });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
