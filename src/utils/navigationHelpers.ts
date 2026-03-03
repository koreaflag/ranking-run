// ============================================================
// Navigation Helpers
// Shared formatting utilities for turn-by-turn navigation UI
// and TTS voice guidance.
// ============================================================

import type { TurnDirection } from './turnPointAnalyzer';
import i18n from '../i18n';

/** i18n key mapping for each turn direction. */
const directionI18nKeyMap: Record<TurnDirection, string> = {
  'straight': 'directions.straight',
  'slight-left': 'directions.slightLeft',
  'left': 'directions.left',
  'sharp-left': 'directions.sharpLeft',
  'slight-right': 'directions.slightRight',
  'right': 'directions.right',
  'sharp-right': 'directions.sharpRight',
  'u-turn': 'directions.uTurn',
};

/**
 * Returns a translated label for the given turn direction.
 */
export function getDirectionLabel(direction: TurnDirection): string {
  return i18n.t(directionI18nKeyMap[direction]);
}

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
 * Format a human-readable turn instruction string.
 * Adapts wording based on distance to the turn.
 */
export function formatTurnInstruction(
  distanceMeters: number,
  direction: TurnDirection,
): string {
  const dir = getDirectionLabel(direction);

  if (distanceMeters <= 20) return i18n.t('voice.turnNow', { direction: dir });
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)}m ${dir}`;
  return `${(distanceMeters / 1000).toFixed(1)}km ${dir}`;
}
