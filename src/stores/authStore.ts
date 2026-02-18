import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthProvider, AuthResponse, UserProfile } from '../types/api';
import { SECURE_STORE_KEYS } from '../utils/constants';
import { authService } from '../services/authService';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  error: string | null;

  login: (provider: AuthProvider, token: string, nonce?: string) => Promise<void>;
  devLogin: (nickname?: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  loadStoredAuth: () => Promise<void>;
  setUser: (user: UserProfile) => void;
  clearError: () => void;
  completeOnboarding: (nickname: string, avatarUrl?: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isNewUser: false,
  error: null,

  login: async (provider, token, nonce) => {
    set({ isLoading: true, error: null });
    try {
      const response: AuthResponse = await authService.login({
        provider,
        token,
        nonce,
      });

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        response.access_token,
      );
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        response.refresh_token,
      );

      set({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        isNewUser: response.user.is_new_user,
        isLoading: false,
      });

      if (!response.user.is_new_user) {
        const profile = await authService.getProfile();
        set({
          user: profile,
          isAuthenticated: true,
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '로그인에 실패했습니다.';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  devLogin: async (nickname, email) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.devLogin(nickname, email);

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        response.access_token,
      );
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        response.refresh_token,
      );

      set({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        user: {
          id: response.user.id,
          email: response.user.email ?? '',
          nickname: response.user.nickname ?? nickname ?? 'dev_user',
          avatar_url: null,
          birthday: null,
          height_cm: null,
          weight_kg: null,
          bio: null,
          instagram_username: null,
          total_distance_meters: 0,
          total_runs: 0,
          created_at: new Date().toISOString(),
        },
        isAuthenticated: true,
        isNewUser: false,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '로그인에 실패했습니다.';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isNewUser: false,
      error: null,
    });
  },

  refreshAuth: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const response = await authService.refreshToken({
        refresh_token: refreshToken,
      });

      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        response.access_token,
      );
      await SecureStore.setItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        response.refresh_token,
      );

      set({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });

      return true;
    } catch {
      await get().logout();
      return false;
    }
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });

    // DEV mode: skip auth and go straight to main screen
    if (__DEV__) {
      set({
        user: {
          id: 'dev-user-001',
          email: 'dev@runcrew.app',
          nickname: 'TestRunner',
          avatar_url: null,
          birthday: null,
          height_cm: 175,
          weight_kg: 70,
          bio: null,
          instagram_username: null,
          total_distance_meters: 0,
          total_runs: 0,
          created_at: new Date().toISOString(),
        },
        accessToken: 'dev-token',
        refreshToken: 'dev-refresh-token',
        isAuthenticated: true,
        isNewUser: false,
        isLoading: false,
      });
      return;
    }

    try {
      const accessToken = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
      );
      const refreshToken = await SecureStore.getItemAsync(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
      );

      if (!accessToken || !refreshToken) {
        set({ isLoading: false });
        return;
      }

      set({ accessToken, refreshToken });

      try {
        const profile = await authService.getProfile();
        set({
          user: profile,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        // Access token expired, try refresh
        const refreshed = await get().refreshAuth();
        if (refreshed) {
          const profile = await authService.getProfile();
          set({
            user: profile,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setUser: (user) => {
    set({ user, isAuthenticated: true });
  },

  clearError: () => {
    set({ error: null });
  },

  completeOnboarding: async (nickname, avatarUrl) => {
    set({ isLoading: true, error: null });
    try {
      const profile = await authService.setupProfile({
        nickname,
        avatar_url: avatarUrl,
      });
      set({
        user: {
          id: profile.id,
          email: '',
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
          birthday: null,
          height_cm: null,
          weight_kg: null,
          bio: null,
          instagram_username: null,
          total_distance_meters: profile.total_distance_meters,
          total_runs: profile.total_runs,
          created_at: profile.created_at,
        },
        isAuthenticated: true,
        isNewUser: false,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : '프로필 설정에 실패했습니다.';
      set({ isLoading: false, error: message });
      throw error;
    }
  },
}));
