// ============================================================
// Interval Training Hook
// Calculates current interval phase (run/walk), set number,
// and remaining time from elapsed duration. Triggers TTS + haptic
// on phase transitions.
// ============================================================

import { useEffect, useRef, useMemo } from 'react';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import type { RunningPhase } from '../stores/runningStore';
import { useSettingsStore } from '../stores/settingsStore';
import i18n from '../i18n';

export type IntervalPhase = 'run' | 'walk';

export interface IntervalState {
  currentPhase: IntervalPhase;
  currentSet: number;         // 1-based
  totalSets: number;
  phaseRemainingSeconds: number;
  phaseTotalSeconds: number;
  totalRemainingSeconds: number;
  isCompleted: boolean;
}

interface UseIntervalTrainingParams {
  enabled: boolean;
  runSeconds: number;
  walkSeconds: number;
  sets: number;
  elapsedSeconds: number;
  phase: RunningPhase;
}

function getTTSLocale(): string {
  const localeMap: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };
  return localeMap[i18n.language] ?? 'en-US';
}

export function useIntervalTraining({
  enabled,
  runSeconds,
  walkSeconds,
  sets,
  elapsedSeconds,
  phase,
}: UseIntervalTrainingParams): IntervalState | null {
  const { voiceGuidance, hapticFeedback } = useSettingsStore();
  const prevPhaseRef = useRef<IntervalPhase | null>(null);
  const prevSetRef = useRef<number>(0);
  const completedAnnouncedRef = useRef(false);

  const cycleDuration = runSeconds + walkSeconds;
  const totalDuration = cycleDuration * sets;

  const state = useMemo((): IntervalState | null => {
    if (!enabled || cycleDuration <= 0 || sets <= 0) return null;

    // All sets completed
    if (elapsedSeconds >= totalDuration) {
      return {
        currentPhase: 'walk',
        currentSet: sets,
        totalSets: sets,
        phaseRemainingSeconds: 0,
        phaseTotalSeconds: walkSeconds,
        totalRemainingSeconds: 0,
        isCompleted: true,
      };
    }

    const currentSet = Math.min(Math.floor(elapsedSeconds / cycleDuration) + 1, sets);
    const elapsedInCycle = elapsedSeconds % cycleDuration;

    let currentPhase: IntervalPhase;
    let phaseRemainingSeconds: number;
    let phaseTotalSeconds: number;

    if (elapsedInCycle < runSeconds) {
      currentPhase = 'run';
      phaseRemainingSeconds = runSeconds - elapsedInCycle;
      phaseTotalSeconds = runSeconds;
    } else {
      currentPhase = 'walk';
      phaseRemainingSeconds = cycleDuration - elapsedInCycle;
      phaseTotalSeconds = walkSeconds;
    }

    return {
      currentPhase,
      currentSet,
      totalSets: sets,
      phaseRemainingSeconds: Math.max(0, Math.ceil(phaseRemainingSeconds)),
      phaseTotalSeconds,
      totalRemainingSeconds: Math.max(0, Math.ceil(totalDuration - elapsedSeconds)),
      isCompleted: false,
    };
  }, [enabled, elapsedSeconds, runSeconds, walkSeconds, sets, cycleDuration, totalDuration]);

  // Phase transition announcements
  useEffect(() => {
    if (!state || phase !== 'running') return;

    const { currentPhase, currentSet, isCompleted } = state;

    // Completion announcement
    if (isCompleted && !completedAnnouncedRef.current) {
      completedAnnouncedRef.current = true;
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 400);
      }
      if (voiceGuidance) {
        const msg = i18n.t('voice.intervalComplete');
        Speech.speak(msg, { language: getTTSLocale(), rate: 1.1 });
      }
      return;
    }

    // Phase change: run <-> walk
    if (prevPhaseRef.current !== null && currentPhase !== prevPhaseRef.current) {
      if (hapticFeedback) {
        if (currentPhase === 'run') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
      if (voiceGuidance) {
        const msg = currentPhase === 'run'
          ? i18n.t('voice.intervalRun', { set: currentSet, total: sets })
          : i18n.t('voice.intervalWalk');
        Speech.speak(msg, { language: getTTSLocale(), rate: 1.1 });
      }
    }

    // Set change announcement (when entering a new set's run phase)
    if (prevSetRef.current > 0 && currentSet !== prevSetRef.current && currentPhase === 'run') {
      // Already handled by phase change above
    }

    prevPhaseRef.current = currentPhase;
    prevSetRef.current = currentSet;
  }, [state, phase, hapticFeedback, voiceGuidance, sets]);

  // Reset refs when disabled
  useEffect(() => {
    if (!enabled) {
      prevPhaseRef.current = null;
      prevSetRef.current = 0;
      completedAnnouncedRef.current = false;
    }
  }, [enabled]);

  return state;
}
