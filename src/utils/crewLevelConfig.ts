// ============================================================
// Crew Level Configuration — single source of truth
// ============================================================

/** XP thresholds per level (cumulative distance in meters) */
export const CREW_LEVEL_THRESHOLDS = [
  0, 100_000, 500_000, 1_500_000, 5_000_000,
  15_000_000, 50_000_000, 150_000_000, 500_000_000, 1_000_000_000,
];

/** Max members allowed at each crew level (null = unlimited) */
export const CREW_MAX_MEMBERS: Record<number, number | null> = {
  1: 10, 2: 20, 3: 30, 4: 50, 5: 80,
  6: 120, 7: 200, 8: 300, 9: null, 10: null,
};

/** Max concurrent active challenges at each crew level */
export const CREW_MAX_CHALLENGES: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 2,
  6: 3, 7: 5, 8: 5, 9: 999, 10: 999,
};

// ============================================================
// Level unlock definitions
// ============================================================

export type UnlockFeature = {
  i18nKey: string;
  requiredLevel: number;
  comingSoon?: boolean;
};

export type LevelUnlock = {
  level: number;
  features: UnlockFeature[];
};

export const LEVEL_UNLOCKS: LevelUnlock[] = [
  {
    level: 1,
    features: [
      { i18nKey: 'crewLevel.unlock.challenge1', requiredLevel: 1 },
      { i18nKey: 'crewLevel.unlock.weeklyRanking', requiredLevel: 1 },
    ],
  },
  {
    level: 2,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers20', requiredLevel: 2 },
      { i18nKey: 'crewLevel.unlock.announcements', requiredLevel: 2, comingSoon: true },
    ],
  },
  {
    level: 3,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers30', requiredLevel: 3 },
      { i18nKey: 'crewLevel.unlock.badgeColor', requiredLevel: 3 },
      { i18nKey: 'crewLevel.unlock.coverImage', requiredLevel: 3 },
    ],
  },
  {
    level: 4,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers50', requiredLevel: 4 },
      { i18nKey: 'crewLevel.unlock.gradeNameCustom', requiredLevel: 4 },
      { i18nKey: 'crewLevel.unlock.challenge2', requiredLevel: 4 },
    ],
  },
  {
    level: 5,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers80', requiredLevel: 5 },
      { i18nKey: 'crewLevel.unlock.crewBattle', requiredLevel: 5, comingSoon: true },
      { i18nKey: 'crewLevel.unlock.inviteLink', requiredLevel: 5, comingSoon: true },
    ],
  },
  {
    level: 6,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers120', requiredLevel: 6 },
      { i18nKey: 'crewLevel.unlock.crewStats', requiredLevel: 6, comingSoon: true },
      { i18nKey: 'crewLevel.unlock.challenge3', requiredLevel: 6 },
    ],
  },
  {
    level: 7,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers200', requiredLevel: 7 },
      { i18nKey: 'crewLevel.unlock.searchPriority', requiredLevel: 7 },
      { i18nKey: 'crewLevel.unlock.challenge5', requiredLevel: 7 },
    ],
  },
  {
    level: 8,
    features: [
      { i18nKey: 'crewLevel.unlock.maxMembers300', requiredLevel: 8 },
      { i18nKey: 'crewLevel.unlock.crewCourse', requiredLevel: 8, comingSoon: true },
    ],
  },
  {
    level: 9,
    features: [
      { i18nKey: 'crewLevel.unlock.unlimitedMembers', requiredLevel: 9 },
      { i18nKey: 'crewLevel.unlock.featured', requiredLevel: 9, comingSoon: true },
      { i18nKey: 'crewLevel.unlock.challengeUnlimited', requiredLevel: 9 },
    ],
  },
  {
    level: 10,
    features: [
      { i18nKey: 'crewLevel.unlock.legendBadge', requiredLevel: 10 },
      { i18nKey: 'crewLevel.unlock.officialCert', requiredLevel: 10, comingSoon: true },
    ],
  },
];

// ============================================================
// Helpers (moved from CrewDetailScreen)
// ============================================================

export function getXpProgress(level: number | undefined, totalXp: number | undefined) {
  const lv = level ?? 1;
  const xp = totalXp ?? 0;
  if (lv >= 10) return { totalXp: xp, nextThreshold: xp, ratio: 1, isMax: true };
  const nextThreshold = CREW_LEVEL_THRESHOLDS[lv] ?? 0;
  const ratio = nextThreshold > 0 ? Math.min(xp / nextThreshold, 1) : 0;
  return { totalXp: xp, nextThreshold, ratio, isMax: false };
}

export function formatXpDistance(meters: number): string {
  if (meters >= 1_000_000) return `${(meters / 1000).toLocaleString()}km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${meters}m`;
}

export function isFeatureUnlocked(crewLevel: number, requiredLevel: number): boolean {
  return crewLevel >= requiredLevel;
}
