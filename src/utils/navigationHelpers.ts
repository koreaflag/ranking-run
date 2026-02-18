// ============================================================
// Navigation Helpers
// Shared formatting utilities for turn-by-turn navigation UI
// and TTS voice guidance.
// ============================================================

import type { TurnDirection } from './turnPointAnalyzer';

/**
 * Korean labels for each turn direction.
 */
export const directionToKorean: Record<TurnDirection, string> = {
  'straight': '직진',
  'slight-left': '약간 좌회전',
  'left': '좌회전',
  'sharp-left': '크게 좌회전',
  'slight-right': '약간 우회전',
  'right': '우회전',
  'sharp-right': '크게 우회전',
  'u-turn': '유턴',
};

/**
 * Map a TurnDirection to an Ionicons icon name.
 */
export function turnDirectionIcon(direction: TurnDirection): string {
  const iconMap: Record<TurnDirection, string> = {
    'straight': 'arrow-up',
    'slight-left': 'arrow-up',
    'left': 'return-up-back',
    'sharp-left': 'return-up-back',
    'slight-right': 'arrow-up',
    'right': 'return-up-forward',
    'sharp-right': 'return-up-forward',
    'u-turn': 'return-down-back',
  };
  return iconMap[direction] ?? 'arrow-up';
}

/**
 * Format a human-readable turn instruction string in Korean.
 * Adapts wording based on distance to the turn.
 */
export function formatTurnInstruction(
  distanceMeters: number,
  direction: TurnDirection,
): string {
  const ko = directionToKorean[direction];

  if (distanceMeters <= 20) return `${ko}하세요`;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)}m 앞에서 ${ko}`;
  return `${(distanceMeters / 1000).toFixed(1)}km 앞에서 ${ko}`;
}
