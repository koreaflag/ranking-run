import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, SECURE_STORE_KEYS } from '../utils/constants';

/**
 * Central fetch wrapper for all API calls.
 * - Automatically attaches JWT Bearer token from SecureStore.
 * - On 401 responses, attempts a token refresh and retries the original request.
 */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
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

async function request<T = unknown>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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

    // Handle 401 with token refresh
    if (response.status === 401 && !options._retry && !endpoint.includes('/auth/refresh')) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          return request<T>(endpoint, {
            ...options,
            _retry: true,
            headers: { ...headers, Authorization: `Bearer ${newToken}` },
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
          processQueue(new Error('No refresh token'), null);
          throw new ApiError(401, { message: 'No refresh token' });
        }

        const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!refreshResponse.ok) {
          await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
          await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
          processQueue(new Error('Refresh failed'), null);
          throw new ApiError(refreshResponse.status, await refreshResponse.json().catch(() => null));
        }

        const { access_token, refresh_token: newRefreshToken } = await refreshResponse.json();

        await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access_token);
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, newRefreshToken);

        processQueue(null, access_token);

        return request<T>(endpoint, {
          ...options,
          _retry: true,
          headers: { ...headers, Authorization: `Bearer ${access_token}` },
        });
      } catch (refreshError) {
        processQueue(refreshError, null);
        throw refreshError;
      } finally {
        isRefreshing = false;
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

export { ApiError };
export default api;
