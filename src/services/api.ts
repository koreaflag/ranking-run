import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, SECURE_STORE_KEYS } from '../utils/constants';

/**
 * Central fetch wrapper for all API calls.
 * - Automatically attaches JWT Bearer token from SecureStore.
 * - On 401 responses, attempts a token refresh and retries the original request.
 * - Single refresh path: all refresh attempts go through performTokenRefresh()
 *   to prevent race conditions with concurrent 401s.
 */

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Single entry point for token refresh. Deduplicates concurrent calls —
 * if a refresh is already in flight, returns the same promise.
 * Used by both the 401 interceptor and authStore.refreshAuth().
 */
async function performTokenRefresh(): Promise<string> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new ApiError(401, { message: 'No refresh token' });
      }

      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.json().catch(() => null);
        if (refreshResponse.status >= 400 && refreshResponse.status < 500) {
          await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
          await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
        }
        throw new ApiError(refreshResponse.status, errorData);
      }

      const { access_token, refresh_token: newRefreshToken } = await refreshResponse.json();

      await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, newRefreshToken);

      return access_token;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface ApiOptions extends RequestInit {
  _retry?: boolean;
}

class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(`API Error: ${status}`);
    this.status = status;
    this.data = data;
  }
}

/** Decode JWT payload without verification (base64url) */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/** Pre-emptive refresh threshold: 10 minutes before expiry */
const REFRESH_AHEAD_SEC = 600;

async function request<T = unknown>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  let token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);

  // Pre-emptive refresh: if token expires within 10 minutes, refresh now
  // to avoid multiple concurrent 401s triggering a race condition.
  if (token && !endpoint.includes('/auth/refresh')) {
    const payload = decodeJwtPayload(token);
    if (payload?.exp && payload.exp - Date.now() / 1000 < REFRESH_AHEAD_SEC) {
      try {
        token = await performTokenRefresh();
      } catch {
        // Pre-emptive refresh failed — continue with current token,
        // the 401 interceptor below will handle it if needed.
      }
    }
  }

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    // Handle 401 with token refresh (single path via performTokenRefresh)
    if (response.status === 401 && !options._retry && !endpoint.includes('/auth/refresh')) {
      try {
        const newAccessToken = await performTokenRefresh();

        return request<T>(endpoint, {
          ...options,
          _retry: true,
          headers: { ...headers, Authorization: `Bearer ${newAccessToken}` },
        });
      } catch (refreshError) {
        throw refreshError;
      }
    }

    const errorData = await response.json().catch(() => null);
    throw new ApiError(response.status, errorData);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

const api = {
  get: <T = unknown>(endpoint: string, options?: ApiOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body: body instanceof FormData ? (body as unknown as BodyInit) : (body ? JSON.stringify(body) : undefined) }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body: body instanceof FormData ? (body as unknown as BodyInit) : (body ? JSON.stringify(body) : undefined) }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body: body instanceof FormData ? (body as unknown as BodyInit) : (body ? JSON.stringify(body) : undefined) }),

  delete: <T = unknown>(endpoint: string, options?: ApiOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};

export { ApiError, performTokenRefresh };
export default api;
