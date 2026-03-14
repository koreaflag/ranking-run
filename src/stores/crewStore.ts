import { create } from 'zustand';
import type { CrewItem, CrewMemberItem } from '../types/api';
import { crewService } from '../services/crewService';
import { useToastStore } from './toastStore';

interface CrewState {
  // Lists
  crews: CrewItem[];
  myCrews: CrewItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  totalCount: number;
  currentPage: number;
  searchQuery: string;
  regionFilter: string;

  // Detail
  currentCrew: CrewItem | null;
  members: CrewMemberItem[];
  membersTotal: number;
  isLoadingDetail: boolean;
  isLoadingMembers: boolean;

  // Actions
  fetchCrews: (reset?: boolean) => Promise<void>;
  fetchMoreCrews: () => Promise<void>;
  fetchMyCrews: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  setRegionFilter: (region: string) => void;
  fetchCrewDetail: (crewId: string) => Promise<void>;
  fetchMembers: (crewId: string) => Promise<void>;
  joinCrew: (crewId: string) => Promise<void>;
  leaveCrew: (crewId: string) => Promise<void>;
  kickMember: (crewId: string, userId: string) => Promise<void>;
  updateMemberRole: (crewId: string, userId: string, role: 'admin' | 'member') => Promise<void>;
  reset: () => void;
}

const PER_PAGE = 20;

export const useCrewStore = create<CrewState>((set, get) => ({
  crews: [],
  myCrews: [],
  isLoading: false,
  isLoadingMore: false,
  totalCount: 0,
  currentPage: 0,
  searchQuery: '',
  regionFilter: '',

  currentCrew: null,
  members: [],
  membersTotal: 0,
  isLoadingDetail: false,
  isLoadingMembers: false,

  fetchCrews: async (reset = true) => {
    const { searchQuery, regionFilter } = get();
    if (reset) {
      set({ isLoading: true, currentPage: 0 });
    }
    try {
      const res = await crewService.listCrews({
        search: searchQuery || undefined,
        region: regionFilter || undefined,
        page: 0,
        per_page: PER_PAGE,
      });
      set({
        crews: res.data,
        totalCount: res.total_count,
        currentPage: 0,
      });
    } catch {
      useToastStore.getState().showToast('error', '크루 목록을 불러올 수 없습니다');
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMoreCrews: async () => {
    const { currentPage, totalCount, crews, searchQuery, regionFilter, isLoadingMore } = get();
    if (isLoadingMore || crews.length >= totalCount) return;

    const nextPage = currentPage + 1;
    set({ isLoadingMore: true });
    try {
      const res = await crewService.listCrews({
        search: searchQuery || undefined,
        region: regionFilter || undefined,
        page: nextPage,
        per_page: PER_PAGE,
      });
      set({
        crews: [...crews, ...res.data],
        totalCount: res.total_count,
        currentPage: nextPage,
      });
    } catch {
      useToastStore.getState().showToast('error', '추가 데이터를 불러올 수 없습니다');
    } finally {
      set({ isLoadingMore: false });
    }
  },

  fetchMyCrews: async () => {
    try {
      const data = await crewService.getMyCrews();
      set({ myCrews: data });
    } catch {
      // background fetch — silent ok
    }
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setRegionFilter: (region: string) => set({ regionFilter: region }),

  fetchCrewDetail: async (crewId: string) => {
    set({ isLoadingDetail: true, currentCrew: null });
    try {
      const crew = await crewService.getCrew(crewId);
      set({ currentCrew: crew });
    } catch {
      useToastStore.getState().showToast('error', '크루 정보를 불러올 수 없습니다');
    } finally {
      set({ isLoadingDetail: false });
    }
  },

  fetchMembers: async (crewId: string) => {
    set({ isLoadingMembers: true });
    try {
      const res = await crewService.getMembers(crewId, { per_page: 100 });
      set({ members: res.data, membersTotal: res.total_count });
    } catch {
      useToastStore.getState().showToast('error', '멤버 목록을 불러올 수 없습니다');
    } finally {
      set({ isLoadingMembers: false });
    }
  },

  joinCrew: async (crewId: string) => {
    try {
      const updated = await crewService.joinCrew(crewId);
      set({ currentCrew: updated });
    } catch {
      throw new Error('join failed');
    }
  },

  leaveCrew: async (crewId: string) => {
    try {
      await crewService.leaveCrew(crewId);
      set((state) => ({
        currentCrew: state.currentCrew
          ? { ...state.currentCrew, is_member: false, my_role: null, member_count: state.currentCrew.member_count - 1 }
          : null,
      }));
    } catch {
      throw new Error('leave failed');
    }
  },

  kickMember: async (crewId: string, userId: string) => {
    try {
      await crewService.kickMember(crewId, userId);
      set((state) => ({
        members: state.members.filter((m) => m.user_id !== userId),
        membersTotal: state.membersTotal - 1,
        currentCrew: state.currentCrew
          ? { ...state.currentCrew, member_count: state.currentCrew.member_count - 1 }
          : null,
      }));
    } catch {
      useToastStore.getState().showToast('error', '멤버 추방에 실패했습니다');
      throw new Error('kick failed');
    }
  },

  updateMemberRole: async (crewId: string, userId: string, role: 'admin' | 'member') => {
    try {
      const updated = await crewService.updateMemberRole(crewId, userId, role);
      set((state) => ({
        members: state.members.map((m) =>
          m.user_id === userId ? { ...m, role: updated.role } : m
        ),
      }));
    } catch {
      useToastStore.getState().showToast('error', '역할 변경에 실패했습니다');
      throw new Error('role update failed');
    }
  },

  reset: () =>
    set({
      crews: [],
      myCrews: [],
      isLoading: false,
      totalCount: 0,
      currentPage: 0,
      searchQuery: '',
      regionFilter: '',
      currentCrew: null,
      members: [],
      membersTotal: 0,
    }),
}));
