import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { API_BASE_URL } from '../utils/constants';

const PING_INTERVAL_MS = 15_000; // Check every 15 seconds while app is active
const PING_TIMEOUT_MS = 5_000; // Timeout for each ping request

/**
 * Hook that monitors network connectivity by periodically pinging the backend.
 * Uses a lightweight HEAD request to the API health endpoint.
 * Re-checks immediately when the app returns to foreground.
 *
 * Does NOT require @react-native-community/netinfo — works with plain fetch.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkConnection() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

        // Use a lightweight request — HEAD to the API base or a known endpoint.
        // Fall back to a simple fetch with GET if HEAD is not supported.
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeout);

        if (mounted) {
          setIsOnline(response.ok || response.status < 500);
        }
      } catch {
        // Network error or timeout — device is offline
        if (mounted) {
          setIsOnline(false);
        }
      }
    }

    function startPolling() {
      // Check immediately
      checkConnection();
      // Then poll at intervals
      intervalRef.current = setInterval(checkConnection, PING_INTERVAL_MS);
    }

    function stopPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function handleAppState(nextState: AppStateStatus) {
      if (nextState === 'active') {
        // App came to foreground — check immediately and resume polling
        checkConnection();
        startPolling();
      } else {
        // App went to background — stop polling to save battery
        stopPolling();
      }
    }

    startPolling();

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      mounted = false;
      stopPolling();
      subscription.remove();
    };
  }, []);

  return isOnline;
}
