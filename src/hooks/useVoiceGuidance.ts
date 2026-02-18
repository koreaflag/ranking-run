// ============================================================
// Voice Guidance Hook
// Provides TTS announcements during course running using
// expo-speech. Handles turn approach alerts, off-course
// warnings, and kilometer milestones.
// ============================================================

import { useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import type { CourseNavigation } from './useCourseNavigation';
import type { RunningPhase } from '../stores/runningStore';
import { directionToKorean } from '../utils/navigationHelpers';

/** Minimum gap between consecutive announcements to avoid spam. */
const MIN_ANNOUNCEMENT_GAP_MS = 5000;

interface UseVoiceGuidanceProps {
  navigation: CourseNavigation | null;
  distanceMeters: number;
  phase: RunningPhase;
  enabled: boolean;
}

export function useVoiceGuidance({
  navigation,
  distanceMeters,
  phase,
  enabled,
}: UseVoiceGuidanceProps) {
  const lastAnnouncementTimeRef = useRef(0);
  const lastTurnIndexRef = useRef(-1);
  /** Tracks which distance threshold was announced for the current turn: 0=none, 200, 100, 20 */
  const lastTurnThresholdRef = useRef<number>(0);
  const lastMilestoneKmRef = useRef(0);
  const wasOffCourseRef = useRef(false);

  // Stop speech when disabled or not running
  useEffect(() => {
    if (!enabled || phase !== 'running') {
      Speech.stop();
    }
  }, [enabled, phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  // Main announcement logic
  useEffect(() => {
    if (!enabled || phase !== 'running' || !navigation) return;

    const now = Date.now();
    if (now - lastAnnouncementTimeRef.current < MIN_ANNOUNCEMENT_GAP_MS) return;

    let announcement: string | null = null;

    // Priority 1: Off-course transitions
    if (navigation.isOffCourse && !wasOffCourseRef.current) {
      announcement = '코스를 이탈했습니다. 코스로 돌아가세요';
    } else if (!navigation.isOffCourse && wasOffCourseRef.current) {
      announcement = '코스에 복귀했습니다';
    }
    wasOffCourseRef.current = navigation.isOffCourse;

    // Priority 2: Turn execution/approach (only if no off-course announcement)
    if (!announcement && navigation.distanceToNextTurn >= 0) {
      const dist = navigation.distanceToNextTurn;
      const turnIdx = navigation.currentTurnIndex + 1; // next turn
      const dir = directionToKorean[navigation.nextTurnDirection];

      // Reset threshold tracking when turn index changes
      if (turnIdx !== lastTurnIndexRef.current) {
        lastTurnIndexRef.current = turnIdx;
        lastTurnThresholdRef.current = 0;
      }

      if (dist <= 20 && lastTurnThresholdRef.current < 20) {
        announcement = `${dir}하세요`;
        lastTurnThresholdRef.current = 20;
      } else if (dist <= 100 && dist > 20 && lastTurnThresholdRef.current < 100) {
        announcement = `100미터 앞에서 ${dir}`;
        lastTurnThresholdRef.current = 100;
      } else if (dist <= 200 && dist > 100 && lastTurnThresholdRef.current < 200) {
        announcement = `200미터 앞에서 ${dir}`;
        lastTurnThresholdRef.current = 200;
      }
    }

    // Priority 3: Kilometer milestones
    if (!announcement) {
      const currentKm = Math.floor(distanceMeters / 1000);
      if (currentKm > lastMilestoneKmRef.current && currentKm > 0) {
        announcement = `${currentKm}킬로미터 완료`;
        lastMilestoneKmRef.current = currentKm;
      }
    }

    if (announcement) {
      Speech.stop();
      Speech.speak(announcement, { language: 'ko-KR', rate: 1.0, pitch: 1.0 });
      lastAnnouncementTimeRef.current = now;
    }
  }, [enabled, phase, navigation, distanceMeters]);
}
