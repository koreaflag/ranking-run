import { useNetworkStore } from '../stores/networkStore';

/**
 * Hook that returns current network connectivity state.
 * Backed by @react-native-community/netinfo via networkStore (event-based, no polling).
 *
 * The store must be initialized by calling `startListening()` once at app mount
 * (done in RootNavigator).
 */
export function useNetworkStatus(): boolean {
  return useNetworkStore((s) => s.isOnline);
}
