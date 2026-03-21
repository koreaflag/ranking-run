import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lightweight stale-while-revalidate cache backed by AsyncStorage.
 *
 * Usage:
 *   const data = await cachedFetch('home:weekly', () => api.getWeekly(), 10 * 60_000);
 *   // Returns cached data instantly if available, then revalidates in background.
 *
 * For screen-level usage, prefer the split helpers:
 *   const cached = await getCache<T>(key);   // show immediately
 *   const fresh  = await fetcher();           // fetch in background
 *   setCache(key, fresh);                     // update cache
 */

const CACHE_PREFIX = '@cache:';

interface CacheEntry<T> {
  data: T;
  ts: number; // Date.now() when cached
}

/** Read cached data. Returns null if missing or parse error. */
export async function getCache<T>(key: string): Promise<{ data: T; ts: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return { data: entry.data, ts: entry.ts };
  } catch {
    return null;
  }
}

/** Write data to cache. Fire-and-forget. */
export function setCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, ts: Date.now() };
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

/** Remove a cache entry. */
export function removeCache(key: string): void {
  AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
}

/**
 * Stale-while-revalidate fetch.
 *
 * 1. If cache exists → return cached data immediately via onData
 * 2. Fetch fresh data from API
 * 3. Update cache + call onData again with fresh data
 *
 * @param key      Cache key (auto-prefixed)
 * @param fetcher  Async function that returns fresh data
 * @param onData   Called with data (once or twice: cached, then fresh)
 * @param maxAge   Max cache age in ms. If cache is older, treat as miss. Default 30 min.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T, fromCache: boolean) => void,
  maxAge: number = 30 * 60_000,
): Promise<void> {
  // 1. Try cache first
  const cached = await getCache<T>(key);
  if (cached && (Date.now() - cached.ts) < maxAge) {
    onData(cached.data, true);
  }

  // 2. Fetch fresh
  try {
    const fresh = await fetcher();
    setCache(key, fresh);
    onData(fresh, false);
  } catch {
    // If fetch fails and we had no cache, nothing to do
  }
}
