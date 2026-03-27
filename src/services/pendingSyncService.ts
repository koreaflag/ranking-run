import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from './authService';
import { courseService } from './courseService';
import { runService } from './runService';
import { ApiError } from './api';
import type { CompleteRunRequest, ProfileUpdateRequest, UploadChunkRequest } from '../types/api';

/** Returns true if the error is a client error (4xx) that should NOT be retried */
function isClientError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

const KEYS = {
  PENDING_PROFILE: '@pending_sync:profile',
  PENDING_COURSES: '@pending_sync:courses',
  PENDING_RUNS: '@pending_sync:runs',
  PENDING_CHUNKS: '@pending_sync:chunks',
} as const;

export interface PendingCourse {
  id: string; // local uuid for deduplication
  payload: {
    run_record_id: string;
    title: string;
    description?: string;
    route_geometry: { type: string; coordinates: number[][] };
    distance_meters: number;
    estimated_duration_seconds: number;
    elevation_gain_meters: number;
    elevation_profile: number[];
    is_public: boolean;
    tags: string[];
    course_type?: string;
    lap_count?: number;
  };
  createdAt: string;
}

// ── Profile ──────────────────────────────────────────────

export async function savePendingProfile(data: ProfileUpdateRequest): Promise<void> {
  await AsyncStorage.setItem(KEYS.PENDING_PROFILE, JSON.stringify(data));
}

export async function getPendingProfile(): Promise<ProfileUpdateRequest | null> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_PROFILE);
  return raw ? JSON.parse(raw) : null;
}

export async function clearPendingProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PENDING_PROFILE);
}

// ── Courses ──────────────────────────────────────────────

export async function savePendingCourse(course: PendingCourse): Promise<void> {
  const existing = await getPendingCourses();
  // Avoid duplicates by id
  const filtered = existing.filter((c) => c.id !== course.id);
  filtered.push(course);
  await AsyncStorage.setItem(KEYS.PENDING_COURSES, JSON.stringify(filtered));
}

export async function getPendingCourses(): Promise<PendingCourse[]> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_COURSES);
  return raw ? JSON.parse(raw) : [];
}

export async function clearPendingCourses(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PENDING_COURSES);
}

export async function removePendingCourse(id: string): Promise<void> {
  const existing = await getPendingCourses();
  const filtered = existing.filter((c) => c.id !== id);
  if (filtered.length > 0) {
    await AsyncStorage.setItem(KEYS.PENDING_COURSES, JSON.stringify(filtered));
  } else {
    await AsyncStorage.removeItem(KEYS.PENDING_COURSES);
  }
}

// ── Run Records ──────────────────────────────────────────

export interface PendingRunRecord {
  id: string;
  sessionId: string;
  payload: CompleteRunRequest;
  createdAt: string;
}

export async function savePendingRunRecord(record: PendingRunRecord): Promise<void> {
  const existing = await getPendingRunRecords();
  const filtered = existing.filter((r) => r.id !== record.id);
  filtered.push(record);
  await AsyncStorage.setItem(KEYS.PENDING_RUNS, JSON.stringify(filtered));
}

export async function getPendingRunRecords(): Promise<PendingRunRecord[]> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_RUNS);
  return raw ? JSON.parse(raw) : [];
}

export async function removePendingRunRecord(id: string): Promise<void> {
  const existing = await getPendingRunRecords();
  const filtered = existing.filter((r) => r.id !== id);
  if (filtered.length > 0) {
    await AsyncStorage.setItem(KEYS.PENDING_RUNS, JSON.stringify(filtered));
  } else {
    await AsyncStorage.removeItem(KEYS.PENDING_RUNS);
  }
}

// ── Chunks (intermediate GPS data during running) ────────

export interface PendingChunk {
  id: string;
  sessionId: string;
  request: UploadChunkRequest;
  createdAt: string;
}

export async function savePendingChunk(chunk: PendingChunk): Promise<void> {
  const existing = await getPendingChunks();
  const filtered = existing.filter((c) => c.id !== chunk.id);
  filtered.push(chunk);
  await AsyncStorage.setItem(KEYS.PENDING_CHUNKS, JSON.stringify(filtered));
}

export async function getPendingChunks(): Promise<PendingChunk[]> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_CHUNKS);
  return raw ? JSON.parse(raw) : [];
}

export async function removePendingChunk(id: string): Promise<void> {
  const existing = await getPendingChunks();
  const filtered = existing.filter((c) => c.id !== id);
  if (filtered.length > 0) {
    await AsyncStorage.setItem(KEYS.PENDING_CHUNKS, JSON.stringify(filtered));
  } else {
    await AsyncStorage.removeItem(KEYS.PENDING_CHUNKS);
  }
}

export async function clearPendingChunksForSession(sessionId: string): Promise<void> {
  const existing = await getPendingChunks();
  const filtered = existing.filter((c) => c.sessionId !== sessionId);
  if (filtered.length > 0) {
    await AsyncStorage.setItem(KEYS.PENDING_CHUNKS, JSON.stringify(filtered));
  } else {
    await AsyncStorage.removeItem(KEYS.PENDING_CHUNKS);
  }
}

// ── Sync All ─────────────────────────────────────────────

export async function syncPendingData(): Promise<{ profileSynced: boolean; coursesSynced: number; runsSynced: number; chunksSynced: number }> {
  let profileSynced = false;
  let coursesSynced = 0;
  let runsSynced = 0;
  let chunksSynced = 0;

  // 1) Sync pending chunks first (they should arrive before run completion)
  const pendingChunks = await getPendingChunks();
  for (const chunk of pendingChunks) {
    try {
      await runService.uploadChunk(chunk.sessionId, chunk.request);
      await removePendingChunk(chunk.id);
      chunksSynced++;
    } catch (err) {
      if (isClientError(err)) {
        // 4xx = data problem, won't succeed on retry — discard
        await removePendingChunk(chunk.id);
      }
      // 5xx / network error — keep pending for next attempt
    }
  }

  // 2) Sync pending profile
  const pendingProfile = await getPendingProfile();
  if (pendingProfile) {
    try {
      await authService.updateProfile(pendingProfile);
      await clearPendingProfile();
      profileSynced = true;
    } catch (err) {
      if (isClientError(err)) await clearPendingProfile();
    }
  }

  // 3) Sync pending run records (before courses, since courses may reference run_record_id)
  const pendingRuns = await getPendingRunRecords();
  for (const run of pendingRuns) {
    try {
      await runService.completeRun(run.sessionId, run.payload);
      await removePendingRunRecord(run.id);
      runsSynced++;
    } catch (err) {
      if (isClientError(err)) await removePendingRunRecord(run.id);
    }
  }

  // 4) Sync pending courses
  const pendingCourses = await getPendingCourses();
  for (const course of pendingCourses) {
    try {
      await courseService.createCourse(course.payload as Parameters<typeof courseService.createCourse>[0]);
      await removePendingCourse(course.id);
      coursesSynced++;
    } catch (err) {
      if (isClientError(err)) await removePendingCourse(course.id);
    }
  }

  return { profileSynced, coursesSynced, runsSynced, chunksSynced };
}

// ── Check if there's any pending data ────────────────────

export async function hasPendingData(): Promise<boolean> {
  const [profile, courses, runs, chunks] = await Promise.all([
    getPendingProfile(),
    getPendingCourses(),
    getPendingRunRecords(),
    getPendingChunks(),
  ]);
  return profile !== null || courses.length > 0 || runs.length > 0 || chunks.length > 0;
}
