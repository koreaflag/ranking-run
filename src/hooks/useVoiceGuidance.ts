// ============================================================
// Voice Guidance Hook
// Provides TTS announcements during course running using
// expo-speech. Handles turn approach alerts, off-course
// warnings, and kilometer milestones.
// ============================================================

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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
}

export function useVoiceGuidance({
  navigation,
  distanceMeters,
  phase,
  enabled,
}: UseVoiceGuidanceProps) {
  const voiceIdRef = useRef<string | undefined>(undefined);
  const lastAnnouncementTimeRef = useRef(0);
  const lastTurnIndexRef = useRef(-1);
  /** Tracks which distance threshold was announced for the current turn: 0=none, 200, 100, 20 */
  const lastTurnThresholdRef = useRef<number>(0);
  const lastMilestoneKmRef = useRef(0);
  const wasOffCourseRef = useRef(false);

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

    // Priority 1: Off-course transitions
    if (navigation.isOffCourse && !wasOffCourseRef.current) {
      announcement = i18n.t('voice.offCourse');
    } else if (!navigation.isOffCourse && wasOffCourseRef.current) {
      announcement = i18n.t('voice.backOnCourse');
    }
    wasOffCourseRef.current = navigation.isOffCourse;

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

    // Priority 3: Kilometer milestones
    if (!announcement) {
      const currentKm = Math.floor(distanceMeters / 1000);
      if (currentKm > lastMilestoneKmRef.current && currentKm > 0) {
        announcement = i18n.t('voice.kmCompleted', { km: currentKm });
        lastMilestoneKmRef.current = currentKm;
      }
    }

    if (announcement) {
      Speech.stop();
      Speech.speak(announcement, {
        language: getTTSLocale(),
        voice: voiceIdRef.current,
        rate: 1.0,
        pitch: 1.0,
      });
      lastAnnouncementTimeRef.current = now;
    }
  }, [enabled, phase, navigation, distanceMeters]);
}
