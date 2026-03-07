import type { TFunction } from 'i18next';
import type { ThemeColors } from './constants';
import type { CrewItem } from '../types/api';

type GradeConfig = CrewItem['grade_config'];

// Lv.5 = 크루장(최고), Lv.1 = 신입(최하)
const DEFAULT_KEYS: Record<number, string> = {
  4: 'crew.gradeViceLeader',
  3: 'crew.gradeCoach',
  2: 'crew.gradeRegular',
  1: 'crew.gradeRookie',
};

export function getGradeName(
  gradeLevel: number,
  gradeConfig: GradeConfig | undefined | null,
  t: TFunction,
): string {
  if (gradeLevel === 5) return t('crew.gradeOwner');
  const custom = gradeConfig?.levels?.[String(gradeLevel)]?.name;
  if (custom) return custom;
  const key = DEFAULT_KEYS[gradeLevel];
  return key ? t(key) : t('crew.members');
}

export function getGradeColor(
  gradeLevel: number,
  colors: ThemeColors,
): string {
  switch (gradeLevel) {
    case 5: return colors.primary;
    case 4: return colors.accent;
    case 3: return colors.secondary;
    case 2: return colors.textSecondary;
    case 1: return colors.textTertiary;
    default: return colors.textTertiary;
  }
}
