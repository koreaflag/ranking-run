import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthProvider, AuthResponse, UserProfile } from '../types/api';
import { SECURE_STORE_KEYS } from '../utils/constants';
import { authService } from '../services/authService';
import { performTokenRefresh } from '../services/api';
import i18n from '../i18n';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  error: string | null;

  login: (provider: AuthProvider, token: string, nonce?: string) => Promise<boolean>;
  devLogin: (nickname?: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  loadStoredAuth: () => Promise<void>;
  setUser: (user: UserProfile) => void;
  clearError: () => void;
  completeOnboarding: (nickname: string, avatarUrl?: string, country?: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isNewUser: false,
  error: null,

  login: async (provider, token, nonce): Promise<boolean> => {
    set({ error: null });
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

      if (response.user.is_new_user) {
        set({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          isNewUser: true,
        });
      } else {
        let profile = null;
        try {
          profile = await authService.getProfile();
        } catch {
          // Profile fetch failed — set authenticated anyway so the user isn't stuck
        }
        set({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          isNewUser: false,
          user: profile,
          isAuthenticated: true,
        });
      }

      return response.user.is_new_user;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : i18n.t('auth.errors.loginFailed');
      set({ error: message });
      throw error;
    }
  },

  devLogin: async (nickname, email) => {
    if (!__DEV__) {
      console.warn('[Auth] devLogin is disabled in production');
      return;
    }
    set({ error: null });
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
          user_code: response.user.user_code ?? '',
          email: response.user.email ?? '',
          nickname: response.user.nickname ?? nickname ?? 'dev_user',
          avatar_url: null,
          birthday: null,
          height_cm: null,
          weight_kg: null,
          bio: null,
          instagram_username: null,
          country: null,
          total_distance_meters: 0,
          total_runs: 0,
          total_points: 0,
          created_at: new Date().toISOString(),
        },
        isAuthenticated: true,
        isNewUser: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : i18n.t('auth.errors.loginFailed');
      set({ error: message });
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
    const storedRefresh = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    if (!storedRefresh) return false;

    try {
      // Use the single performTokenRefresh() from api.ts to prevent
      // race conditions with the 401 interceptor.
      const newAccessToken = await performTokenRefresh();

      const newRefreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
      set({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });

      return true;
    } catch (error: unknown) {
      const isAuthFailure =
        error instanceof Error &&
        'status' in error &&
        typeof (error as any).status === 'number' &&
        (error as any).status >= 400 &&
        (error as any).status < 500;
      if (isAuthFailure) {
        await get().logout();
      }
      return false;
    }
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });

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
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), 10000),
        );
        const profile = await Promise.race([
          authService.getProfile(),
          timeout,
        ]);
        // If user has no nickname, onboarding was never completed
        // (e.g. first login created user but app navigated back to login)
        const needsOnboarding = !profile.nickname;
        set({
          user: profile,
          isAuthenticated: !needsOnboarding,
          isNewUser: needsOnboarding,
          isLoading: false,
        });
      } catch {
        // Access token expired or server unreachable, try refresh
        try {
          const refreshed = await get().refreshAuth();
          if (refreshed) {
            try {
              const profile = await authService.getProfile();
              const needsOnboarding = !profile.nickname;
              set({
                user: profile,
                isAuthenticated: !needsOnboarding,
                isNewUser: needsOnboarding,
                isLoading: false,
              });
            } catch {
              // Profile fetch failed after refresh — still authenticated,
              // just don't have profile data yet. User can pull-to-refresh.
              set({ isAuthenticated: true, isLoading: false });
            }
          } else {
            // refreshAuth returned false — if tokens still exist, stay authenticated
            // (transient network error won't have wiped them)
            const currentToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
            if (currentToken) {
              set({ isAuthenticated: true, isLoading: false });
            } else {
              set({ isLoading: false });
            }
          }
        } catch {
          // Network completely unavailable — keep tokens, mark as authenticated
          // so user can use the app offline
          set({ isAuthenticated: true, isLoading: false });
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

  completeOnboarding: async (nickname, avatarUrl, country) => {
    set({ error: null });
    try {
      const profile = await authService.setupProfile({
        nickname,
        avatar_url: avatarUrl,
        country,
      });
      set({
        user: {
          id: profile.id,
          user_code: get().user?.user_code ?? '',
          email: '',
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
          birthday: null,
          height_cm: null,
          weight_kg: null,
          bio: null,
          instagram_username: null,
          country: country ?? null,
          total_distance_meters: profile.total_distance_meters,
          total_runs: profile.total_runs,
          total_points: profile.total_points ?? 0,
          created_at: profile.created_at,
        },
        isAuthenticated: true,
        isNewUser: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : i18n.t('auth.errors.profileSetupFailed');
      set({ error: message });
      throw error;
    }
  },
}));
