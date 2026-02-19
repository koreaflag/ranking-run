import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from './authService';
import { courseService } from './courseService';
import { runService } from './runService';
import type { CompleteRunRequest, ProfileUpdateRequest } from '../types/api';

const KEYS = {
  PENDING_PROFILE: '@pending_sync:profile',
  PENDING_COURSES: '@pending_sync:courses',
  PENDING_RUNS: '@pending_sync:runs',
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

// ── Sync All ─────────────────────────────────────────────

export async function syncPendingData(): Promise<{ profileSynced: boolean; coursesSynced: number; runsSynced: number }> {
  let profileSynced = false;
  let coursesSynced = 0;
  let runsSynced = 0;

  // 1) Sync pending profile
  const pendingProfile = await getPendingProfile();
  if (pendingProfile) {
    try {
      await authService.updateProfile(pendingProfile);
      await clearPendingProfile();
      profileSynced = true;
    } catch {
      // Server still unreachable — keep pending
    }
  }

  // 2) Sync pending run records (before courses, since courses may reference run_record_id)
  const pendingRuns = await getPendingRunRecords();
  for (const run of pendingRuns) {
    try {
      await runService.completeRun(run.sessionId, run.payload);
      await removePendingRunRecord(run.id);
      runsSynced++;
    } catch {
      // Server still unreachable — keep pending
    }
  }

  // 3) Sync pending courses
  const pendingCourses = await getPendingCourses();
  for (const course of pendingCourses) {
    try {
      await courseService.createCourse(course.payload as Parameters<typeof courseService.createCourse>[0]);
      await removePendingCourse(course.id);
      coursesSynced++;
    } catch {
      // Server still unreachable — keep pending
    }
  }

  return { profileSynced, coursesSynced, runsSynced };
}

// ── Check if there's any pending data ────────────────────

export async function hasPendingData(): Promise<boolean> {
  const [profile, courses, runs] = await Promise.all([
    getPendingProfile(),
    getPendingCourses(),
    getPendingRunRecords(),
  ]);
  return profile !== null || courses.length > 0 || runs.length > 0;
}
