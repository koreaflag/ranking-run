import api from './api';
import type {
  LoginRequest,
  AuthResponse,
  RefreshRequest,
  RefreshResponse,
  UserProfile,
  ProfileSetupRequest,
  ProfileSetupResponse,
  ProfileUpdateRequest,
  AvatarUploadResponse,
} from '../types/api';

export const authService = {
  /**
   * Authenticate with a social login token (Kakao or Apple).
   * The server validates the social token, creates/finds the user,
   * and returns JWT tokens.
   */
  async login(request: LoginRequest): Promise<AuthResponse> {
    return api.post<AuthResponse>('/auth/login', request);
  },

  /**
   * Dev-only login: creates or reuses a test user and returns tokens.
   * Only works when backend APP_ENV=development.
   */
  async devLogin(nickname?: string, email?: string): Promise<AuthResponse> {
    return api.post<AuthResponse>('/auth/dev-login', {
      nickname: nickname ?? 'dev_user',
      email: email ?? 'dev@runcrew.test',
    });
  },

  /**
   * Refresh expired access token using a valid refresh token.
   * Uses refresh token rotation for security.
   */
  async refreshToken(request: RefreshRequest): Promise<RefreshResponse> {
    return api.post<RefreshResponse>('/auth/refresh', request);
  },

  /**
   * Fetch the currently authenticated user's profile.
   * Used on app launch to validate the stored token.
   */
  async getProfile(): Promise<UserProfile> {
    return api.get<UserProfile>('/users/me');
  },

  /**
   * Set up initial profile for new users (nickname, optional avatar).
   * Called after social login when is_new_user is true.
   */
  async setupProfile(
    request: ProfileSetupRequest,
  ): Promise<ProfileSetupResponse> {
    return api.post<ProfileSetupResponse>('/users/me/profile', request);
  },

  /**
   * Update existing profile fields (nickname, avatar).
   */
  async updateProfile(
    request: ProfileUpdateRequest,
  ): Promise<{
    id: string;
    nickname: string;
    avatar_url: string | null;
    birthday: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    bio: string | null;
    instagram_username: string | null;
    country: string | null;
  }> {
    return api.patch('/users/me/profile', request);
  },

  /**
   * Upload avatar image. Returns the public URL to use with updateProfile.
   * Uses FormData with raw fetch headers to bypass JSON serialization.
   */
  async uploadAvatar(fileUri: string): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    const filename = fileUri.split('/').pop() ?? 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', {
      uri: fileUri,
      name: filename,
      type,
    } as unknown as Blob);

    return api.post<AvatarUploadResponse>('/uploads/avatar', formData);
  },
};
