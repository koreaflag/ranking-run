// ============================================================
// Voice Guidance Hook
// Provides TTS announcements during course running using
// expo-speech. Handles turn approach alerts, off-course
// warnings, and kilometer milestones.
// ============================================================

import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import type { CourseNavigation } from './useCourseNavigation';
import type { RunningPhase } from '../stores/runningStore';
import { getDirectionLabel } from '../utils/navigationHelpers';
import i18n from '../i18n';

/** Minimum gap between consecutive announcements to avoid spam. */
const MIN_ANNOUNCEMENT_GAP_MS = 5000;

/** Cached best voice identifier per language */
let cachedVoice: string | null = null;
let cachedVoiceLang: string | null = null;
let voiceSearchDone = false;

/** Map i18n language code to BCP 47 locale for TTS */
function getTTSLocale(): string {
  const localeMap: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };
  return localeMap[i18n.language] ?? 'en-US';
}

/** Find the best available voice for the current language (premium > enhanced > default) */
async function getBestVoice(): Promise<string | undefined> {
  const lang = i18n.language;
  if (voiceSearchDone && cachedVoiceLang === lang) return cachedVoice ?? undefined;
  voiceSearchDone = true;
  cachedVoiceLang = lang;

  try {
    const ttsLocale = getTTSLocale();
    const langPrefix = lang; // e.g., 'ko', 'en', 'ja'
    const voices = await Speech.getAvailableVoicesAsync();
    const matchedVoices = voices.filter(
      (v) => v.language === ttsLocale || v.language.startsWith(langPrefix),
    );

    if (matchedVoices.length === 0) { cachedVoice = null; return undefined; }

    // iOS: prefer premium > enhanced > compact
    if (Platform.OS === 'ios') {
      const premium = matchedVoices.find((v) => v.identifier.includes('.premium.'));
      if (premium) { cachedVoice = premium.identifier; return premium.identifier; }

      const enhanced = matchedVoices.find((v) => v.identifier.includes('.enhanced.'));
      if (enhanced) { cachedVoice = enhanced.identifier; return enhanced.identifier; }
    }

    // Fallback: first available voice for the language
    cachedVoice = matchedVoices[0].identifier;
    return cachedVoice;
  } catch {
    cachedVoice = null;
    return undefined;
  }
}

interface UseVoiceGuidanceProps {
  navigation: CourseNavigation | null;
  distanceMeters: number;
  phase: RunningPhase;
  enabled: boolean;
  /** When provided, pace coaching TTS replaces the generic km milestone announcement */
  paceCoachingMessage?: string | null;
  /** Off-course warning level: 0=on-course, 1=grace period, 2=penalty active */
  offCourseLevel?: number;
  /** Elevation profile of the course (per-point altitudes in meters) */
  elevationProfile?: number[] | null;
}

export function useVoiceGuidance({
  navigation,
  distanceMeters,
  phase,
  enabled,
  paceCoachingMessage,
  offCourseLevel = 0,
  elevationProfile,
}: UseVoiceGuidanceProps) {
  const voiceIdRef = useRef<string | undefined>(undefined);
  const lastAnnouncementTimeRef = useRef(0);
  const lastTurnIndexRef = useRef(-1);
  /** Tracks which distance threshold was announced for the current turn: 0=none, 200, 100, 20 */
  const lastTurnThresholdRef = useRef<number>(0);
  const lastMilestoneKmRef = useRef(0);
  const wasOffCourseRef = useRef(false);
  const lastOffCourseLevelRef = useRef(0);
  const lastElevationAlertIdxRef = useRef(-999);

  // Pre-fetch best voice on mount
  useEffect(() => {
    getBestVoice().then((id) => { voiceIdRef.current = id; });
  }, []);

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

    // Priority 1: Off-course transitions + escalating warnings
    if (navigation.isOffCourse && !wasOffCourseRef.current) {
      announcement = i18n.t('voice.offCourse');
    } else if (!navigation.isOffCourse && wasOffCourseRef.current) {
      announcement = i18n.t('voice.backOnCourse');
    } else if (offCourseLevel === 2 && lastOffCourseLevelRef.current < 2) {
      // Escalation: grace period expired → penalty active
      announcement = i18n.t('voice.offCoursePenalty');
    }
    wasOffCourseRef.current = navigation.isOffCourse;
    lastOffCourseLevelRef.current = offCourseLevel;

    // Priority 2: Turn execution/approach (only if no off-course announcement)
    if (!announcement && navigation.distanceToNextTurn >= 0) {
      const dist = navigation.distanceToNextTurn;
      const turnIdx = navigation.currentTurnIndex + 1; // next turn
      const dir = getDirectionLabel(navigation.nextTurnDirection);

      // Reset threshold tracking when turn index changes
      if (turnIdx !== lastTurnIndexRef.current) {
        lastTurnIndexRef.current = turnIdx;
        lastTurnThresholdRef.current = 0;
      }

      if (dist <= 20 && lastTurnThresholdRef.current < 20) {
        announcement = i18n.t('voice.turnNow', { direction: dir });
        lastTurnThresholdRef.current = 20;
      } else if (dist <= 100 && dist > 20 && lastTurnThresholdRef.current < 100) {
        announcement = i18n.t('voice.turnIn100m', { direction: dir });
        lastTurnThresholdRef.current = 100;
      } else if (dist <= 200 && dist > 100 && lastTurnThresholdRef.current < 200) {
        announcement = i18n.t('voice.turnIn200m', { direction: dir });
        lastTurnThresholdRef.current = 200;
      }
    }

    // Priority 2.5: Elevation pre-alerts (with index-based hysteresis)
    const MIN_ELEVATION_ALERT_GAP = 200; // ~400-800m between alerts
    if (!announcement && elevationProfile && elevationProfile.length > 0 && navigation) {
      const idx = navigation.nearestPointIndex;
      if (idx - lastElevationAlertIdxRef.current >= MIN_ELEVATION_ALERT_GAP) {
        const aheadIdx = Math.min(idx + 50, elevationProfile.length - 1);
        if (idx < elevationProfile.length && aheadIdx > idx) {
          const diff = elevationProfile[aheadIdx] - elevationProfile[idx];
          if (diff > 10) {
            announcement = i18n.t('voice.uphillAhead', { meters: Math.round(diff) });
            lastElevationAlertIdxRef.current = idx;
          } else if (diff < -10) {
            announcement = i18n.t('voice.downhillAhead', { meters: Math.round(Math.abs(diff)) });
            lastElevationAlertIdxRef.current = idx;
          }
        }
      }
    }

    // Priority 3: Kilometer milestones (with optional pace coaching overlay)
    if (!announcement) {
      const currentKm = Math.floor(distanceMeters / 1000);
      if (currentKm > lastMilestoneKmRef.current && currentKm > 0) {
        const kmMsg = i18n.t('voice.kmCompleted', { km: currentKm });
        // Append pace coaching message if available (program goal running)
        announcement = paceCoachingMessage
          ? `${kmMsg}. ${paceCoachingMessage}`
          : kmMsg;
        lastMilestoneKmRef.current = currentKm;
      }
    }

    if (announcement) {
      Speech.stop();
      // Configure audio session to play through mute switch (iOS)
      const gps = Platform.OS === 'ios' ? NativeModules.GPSTrackerModule : null;
      gps?.configureAudioForSpeech?.().catch((err: any) => {
        console.warn('[useVoiceGuidance] 오디오 세션 설정 실패:', err);
      });
      Speech.speak(announcement, {
        language: getTTSLocale(),
        voice: voiceIdRef.current,
        rate: 1.0,
        pitch: 1.0,
        onDone: () => {
          // Restore audio session so background audio unducks
          gps?.restoreAudioAfterSpeech?.().catch((err: any) => {
            console.warn('[useVoiceGuidance] 오디오 세션 복원 실패:', err);
          });
        },
      });
      lastAnnouncementTimeRef.current = now;
    }
  }, [enabled, phase, navigation, distanceMeters, offCourseLevel, elevationProfile, paceCoachingMessage]);
}
