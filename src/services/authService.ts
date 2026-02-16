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
    const response = await api.post<AuthResponse>('/auth/login', request);
    return response.data;
  },

  /**
   * Refresh expired access token using a valid refresh token.
   * Uses refresh token rotation for security.
   */
  async refreshToken(request: RefreshRequest): Promise<RefreshResponse> {
    const response = await api.post<RefreshResponse>('/auth/refresh', request);
    return response.data;
  },

  /**
   * Fetch the currently authenticated user's profile.
   * Used on app launch to validate the stored token.
   */
  async getProfile(): Promise<UserProfile> {
    const response = await api.get<UserProfile>('/users/me');
    return response.data;
  },

  /**
   * Set up initial profile for new users (nickname, optional avatar).
   * Called after social login when is_new_user is true.
   */
  async setupProfile(
    request: ProfileSetupRequest,
  ): Promise<ProfileSetupResponse> {
    const response = await api.post<ProfileSetupResponse>(
      '/users/me/profile',
      request,
    );
    return response.data;
  },

  /**
   * Update existing profile fields (nickname, avatar).
   */
  async updateProfile(
    request: ProfileUpdateRequest,
  ): Promise<{ id: string; nickname: string; avatar_url: string | null }> {
    const response = await api.patch<{
      id: string;
      nickname: string;
      avatar_url: string | null;
    }>('/users/me/profile', request);
    return response.data;
  },

  /**
   * Upload avatar image. Returns the public URL to use with updateProfile.
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

    const response = await api.post<AvatarUploadResponse>(
      '/uploads/avatar',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },
};
