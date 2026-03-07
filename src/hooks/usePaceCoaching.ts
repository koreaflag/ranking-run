// ============================================================
// Pace Coaching Hook
// Calculates real-time pace delta for "program" goal running
// (distance + time target). Provides status classification and
// triggers haptic + TTS alerts at km splits and status transitions.
// ============================================================

import { useEffect, useRef, useMemo } from 'react';
import { Platform, NativeModules } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import type { RunningPhase } from '../stores/runningStore';
import type { Split } from '../types/api';
import { useSettingsStore } from '../stores/settingsStore';
import i18n from '../i18n';

/** Minimum distance before pace coaching activates (initial GPS is unstable) */
const MIN_ACTIVE_DISTANCE_M = 200;

/** Deadband: within ±30s of target = "on_pace" */
const ON_PACE_BAND_S = 30;

/** Behind threshold: > 30s behind but < 60s = "behind"; > 60s = "critical" */
const CRITICAL_THRESHOLD_S = 60;

/** Minimum interval between status-change alerts (prevents spam) */
const STATUS_ALERT_MIN_GAP_MS = 30_000;

export type PaceStatus = 'ahead' | 'on_pace' | 'behind' | 'critical';

export interface PaceCoachingState {
  requiredPace: number;     // seconds/km (target pace)
  currentPace: number;      // seconds/km (current avg pace)
  timeDelta: number;        // seconds (+ = ahead, - = behind)
  projectedFinish: number;  // seconds (estimated total time at current pace)
  status: PaceStatus;
}

interface UsePaceCoachingParams {
  enabled: boolean;          // runGoal.type === 'program'
  targetDistance: number;    // meters
  targetTime: number;        // seconds
  currentDistance: number;   // meters
  elapsedTime: number;       // seconds
  avgPace: number;           // seconds/km
  phase: RunningPhase;
  splits: Split[];
}

/** Map i18n language code to BCP 47 locale for TTS */
function getTTSLocale(): string {
  const localeMap: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };
  return localeMap[i18n.language] ?? 'en-US';
}

function classifyStatus(timeDelta: number): PaceStatus {
  if (timeDelta > ON_PACE_BAND_S) return 'ahead';
  if (timeDelta >= -ON_PACE_BAND_S) return 'on_pace';
  if (timeDelta >= -CRITICAL_THRESHOLD_S) return 'behind';
  return 'critical';
}

function getCoachingMessage(status: PaceStatus, timeDelta: number): string {
  const t = i18n.t.bind(i18n);
  const absDelta = Math.abs(Math.round(timeDelta));
  switch (status) {
    case 'ahead':
      return t('voice.paceAhead', { seconds: absDelta });
    case 'on_pace':
      return t('voice.paceOnTrack');
    case 'behind':
      return t('voice.paceBehind', { seconds: absDelta });
    case 'critical':
      return t('voice.paceCritical');
  }
}

async function fireHaptic(status: PaceStatus) {
  switch (status) {
    case 'ahead':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'on_pace':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'behind':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await new Promise((r) => setTimeout(r, 300));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'critical':
      for (let i = 0; i < 3; i++) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (i < 2) await new Promise((r) => setTimeout(r, 250));
      }
      break;
  }
}

function speak(message: string) {
  Speech.stop();
  const gps = Platform.OS === 'ios' ? NativeModules.GPSTrackerModule : null;
  gps?.configureAudioForSpeech?.().catch(() => {});
  Speech.speak(message, {
    language: getTTSLocale(),
    rate: 1.0,
    pitch: 1.0,
    onDone: () => {
      gps?.restoreAudioAfterSpeech?.().catch(() => {});
    },
  });
}

export function usePaceCoaching({
  enabled,
  targetDistance,
  targetTime,
  currentDistance,
  elapsedTime,
  avgPace,
  phase,
  splits,
}: UsePaceCoachingParams): PaceCoachingState | null {
  const prevSplitCountRef = useRef(0);
  const prevStatusRef = useRef<PaceStatus | null>(null);
  const lastStatusAlertTimeRef = useRef(0);

  const { hapticFeedback, voiceGuidance } = useSettingsStore();

  // Determine if coaching is active (all conditions met)
  const isActive = enabled
    && targetDistance > 0
    && targetTime > 0
    && (phase === 'running' || phase === 'paused')
    && currentDistance >= MIN_ACTIVE_DISTANCE_M;

  // Core calculations (always compute to keep hooks stable)
  const requiredPace = targetDistance > 0 ? targetTime / (targetDistance / 1000) : 0;
  const projectedFinish = currentDistance > 0
    ? (targetDistance / currentDistance) * elapsedTime
    : Infinity;
  const timeDelta = targetTime - projectedFinish;
  const status = isActive ? classifyStatus(timeDelta) : 'on_pace';

  const state: PaceCoachingState | null = useMemo(() => {
    if (!isActive) return null;
    return {
      requiredPace,
      currentPace: avgPace,
      timeDelta,
      projectedFinish,
      status,
    };
  }, [isActive, requiredPace, avgPace, timeDelta, projectedFinish, status]);

  // Reset refs when goal changes or run restarts
  useEffect(() => {
    if (!enabled || phase === 'idle') {
      prevSplitCountRef.current = 0;
      prevStatusRef.current = null;
      lastStatusAlertTimeRef.current = 0;
    }
  }, [enabled, phase]);

  // Split-based alert: fires when a new split is added
  const currentSplitCount = splits.length;
  useEffect(() => {
    if (!isActive || phase !== 'running') return;
    if (currentSplitCount <= prevSplitCountRef.current) return;

    prevSplitCountRef.current = currentSplitCount;

    const msg = getCoachingMessage(status, timeDelta);
    if (voiceGuidance) speak(msg);
    if (hapticFeedback) fireHaptic(status).catch(() => {});

    prevStatusRef.current = status;
    lastStatusAlertTimeRef.current = Date.now();
  }, [currentSplitCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status transition alert: fires when status worsens (behind → critical)
  useEffect(() => {
    if (!isActive || phase !== 'running') return;
    if (prevStatusRef.current === null) {
      prevStatusRef.current = status;
      return;
    }
    if (status === prevStatusRef.current) return;

    const now = Date.now();
    if (now - lastStatusAlertTimeRef.current < STATUS_ALERT_MIN_GAP_MS) {
      prevStatusRef.current = status;
      return;
    }

    const severity: Record<PaceStatus, number> = { ahead: 0, on_pace: 1, behind: 2, critical: 3 };
    if (severity[status] > severity[prevStatusRef.current]) {
      const msg = getCoachingMessage(status, timeDelta);
      if (voiceGuidance) speak(msg);
      if (hapticFeedback) fireHaptic(status).catch(() => {});
      lastStatusAlertTimeRef.current = now;
    }

    prevStatusRef.current = status;
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
