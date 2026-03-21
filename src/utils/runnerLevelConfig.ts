// ============================================================
// Runner Level Configuration — 96 levels, 12 animal tiers
// ============================================================

/** XP thresholds per level (cumulative distance in meters). Index 0 = Lv.1 */
export const RUNNER_LEVEL_THRESHOLDS: number[] = [
  // Tier 1: 아기 거북이 (Lv.1-8) — ~5km increments
  0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000,
  // Tier 2: 부지런한 다람쥐 (Lv.9-16) — ~10km increments
  50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000, 120_000,
  // Tier 3: 초원의 토끼 (Lv.17-24) — ~20km increments
  140_000, 160_000, 180_000, 200_000, 220_000, 240_000, 260_000, 280_000,
  // Tier 4: 야생마 (Lv.25-32) — ~35km increments
  320_000, 360_000, 400_000, 440_000, 480_000, 520_000, 560_000, 600_000,
  // Tier 5: 사냥하는 늑대 (Lv.33-40) — ~55km increments
  660_000, 720_000, 780_000, 840_000, 900_000, 960_000, 1_020_000, 1_100_000,
  // Tier 6: 초원의 치타 (Lv.41-48) — ~75km increments
  1_180_000, 1_260_000, 1_340_000, 1_420_000, 1_500_000, 1_580_000, 1_660_000, 1_750_000,
  // Tier 7: 하늘의 매 (Lv.49-56) — ~112km increments
  1_860_000, 1_980_000, 2_100_000, 2_220_000, 2_350_000, 2_480_000, 2_620_000, 2_780_000,
  // Tier 8: 번개 표범 (Lv.57-64) — ~162km increments
  2_950_000, 3_120_000, 3_300_000, 3_480_000, 3_660_000, 3_850_000, 4_050_000, 4_260_000,
  // Tier 9: 폭풍의 용 (Lv.65-72) — ~225km increments
  4_500_000, 4_750_000, 5_000_000, 5_260_000, 5_530_000, 5_810_000, 6_100_000, 6_400_000,
  // Tier 10: 불사조 (Lv.73-80) — ~300km increments
  6_720_000, 7_060_000, 7_400_000, 7_760_000, 8_130_000, 8_510_000, 8_900_000, 9_300_000,
  // Tier 11: 유니콘 (Lv.81-88) — ~400km increments
  9_720_000, 10_150_000, 10_600_000, 11_060_000, 11_540_000, 12_030_000, 12_540_000, 13_070_000,
  // Tier 12: 신수 기린 (Lv.89-96) — ~475km increments
  13_620_000, 14_000_000, 14_400_000, 14_800_000, 15_200_000, 15_600_000, 16_000_000, 16_500_000,
];

// ============================================================
// 12 Animal Tiers
// ============================================================

export type RunnerTierConfig = {
  nameKey: string;       // i18n key for tier name
  descKey: string;       // i18n key for description
  animal: string;        // animal icon identifier
  color: string;         // primary accent color
  bgColor: string;       // badge background (dark)
  borderColor: string;   // badge border (dark)
  textColor: string;     // badge text (dark)
  bgColorLight: string;  // badge background (light)
  borderColorLight: string; // badge border (light)
  textColorLight: string;   // badge text (light)
};

export const RUNNER_TIERS: RunnerTierConfig[] = [
  // Tier 1: Lv.1-8
  { nameKey: 'runnerLevel.tier1.name', descKey: 'runnerLevel.tier1.desc', animal: 'turtle', color: '#E8985A', bgColor: '#3A2510', borderColor: '#E8985A', textColor: '#F0B888', bgColorLight: '#FFF0E3', borderColorLight: '#E8985A50', textColorLight: '#A0612A' },
  // Tier 2: Lv.9-16
  { nameKey: 'runnerLevel.tier2.name', descKey: 'runnerLevel.tier2.desc', animal: 'squirrel', color: '#4CAF50', bgColor: '#1B3A1B', borderColor: '#4CAF50', textColor: '#81C784', bgColorLight: '#E8F5E9', borderColorLight: '#4CAF5050', textColorLight: '#2E7D32' },
  // Tier 3: Lv.17-24
  { nameKey: 'runnerLevel.tier3.name', descKey: 'runnerLevel.tier3.desc', animal: 'rabbit', color: '#03A9F4', bgColor: '#0D2B3E', borderColor: '#03A9F4', textColor: '#4FC3F7', bgColorLight: '#E1F5FE', borderColorLight: '#03A9F450', textColorLight: '#0277BD' },
  // Tier 4: Lv.25-32
  { nameKey: 'runnerLevel.tier4.name', descKey: 'runnerLevel.tier4.desc', animal: 'horse', color: '#1565C0', bgColor: '#0A1F3A', borderColor: '#1565C0', textColor: '#42A5F5', bgColorLight: '#E3F2FD', borderColorLight: '#1565C050', textColorLight: '#0D47A1' },
  // Tier 5: Lv.33-40
  { nameKey: 'runnerLevel.tier5.name', descKey: 'runnerLevel.tier5.desc', animal: 'wolf', color: '#7E57C2', bgColor: '#1F153A', borderColor: '#7E57C2', textColor: '#B39DDB', bgColorLight: '#EDE7F6', borderColorLight: '#7E57C250', textColorLight: '#4527A0' },
  // Tier 6: Lv.41-48
  { nameKey: 'runnerLevel.tier6.name', descKey: 'runnerLevel.tier6.desc', animal: 'cheetah', color: '#FF8F00', bgColor: '#3A2800', borderColor: '#FF8F00', textColor: '#FFB74D', bgColorLight: '#FFF3E0', borderColorLight: '#FF8F0050', textColorLight: '#E65100' },
  // Tier 7: Lv.49-56
  { nameKey: 'runnerLevel.tier7.name', descKey: 'runnerLevel.tier7.desc', animal: 'eagle', color: '#D32F2F', bgColor: '#3A0D0D', borderColor: '#D32F2F', textColor: '#EF9A9A', bgColorLight: '#FFEBEE', borderColorLight: '#D32F2F50', textColorLight: '#B71C1C' },
  // Tier 8: Lv.57-64
  { nameKey: 'runnerLevel.tier8.name', descKey: 'runnerLevel.tier8.desc', animal: 'panther', color: '#FFD700', bgColor: '#3A3000', borderColor: '#FFD700', textColor: '#FFE082', bgColorLight: '#FFFDE7', borderColorLight: '#FFD70050', textColorLight: '#F57F17' },
  // Tier 9: Lv.65-72
  { nameKey: 'runnerLevel.tier9.name', descKey: 'runnerLevel.tier9.desc', animal: 'dragon', color: '#B0BEC5', bgColor: '#1E2A30', borderColor: '#B0BEC5', textColor: '#E0E0E0', bgColorLight: '#ECEFF1', borderColorLight: '#B0BEC550', textColorLight: '#455A64' },
  // Tier 10: Lv.73-80
  { nameKey: 'runnerLevel.tier10.name', descKey: 'runnerLevel.tier10.desc', animal: 'phoenix', color: '#E91E63', bgColor: '#3A0A1F', borderColor: '#E91E63', textColor: '#F48FB1', bgColorLight: '#FCE4EC', borderColorLight: '#E91E6350', textColorLight: '#AD1457' },
  // Tier 11: Lv.81-88
  { nameKey: 'runnerLevel.tier11.name', descKey: 'runnerLevel.tier11.desc', animal: 'unicorn', color: '#AB47BC', bgColor: '#2A1030', borderColor: '#AB47BC', textColor: '#CE93D8', bgColorLight: '#F3E5F5', borderColorLight: '#AB47BC50', textColorLight: '#7B1FA2' },
  // Tier 12: Lv.89-96
  { nameKey: 'runnerLevel.tier12.name', descKey: 'runnerLevel.tier12.desc', animal: 'qilin', color: '#FFD700', bgColor: '#1A1A1A', borderColor: '#FFD700', textColor: '#FFD700', bgColorLight: '#FFFDE7', borderColorLight: '#FFD70050', textColorLight: '#F57F17' },
];

// ============================================================
// Helpers
// ============================================================

/** Calculate runner level from cumulative distance in meters. */
export function calcRunnerLevel(totalDistanceMeters: number): number {
  for (let i = RUNNER_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalDistanceMeters >= RUNNER_LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

/** Get the tier config for a given runner level. */
export function getRunnerTier(level: number): RunnerTierConfig {
  const tierIndex = Math.min(Math.floor((level - 1) / 8), RUNNER_TIERS.length - 1);
  return RUNNER_TIERS[tierIndex];
}

/** Get XP progress toward next level. */
export function getRunnerXpProgress(level: number, totalDistanceMeters: number) {
  const lv = Math.max(1, Math.min(level, 96));
  if (lv >= 96) return { current: totalDistanceMeters, next: totalDistanceMeters, ratio: 1, isMax: true };
  const currentThreshold = RUNNER_LEVEL_THRESHOLDS[lv - 1] ?? 0;
  const nextThreshold = RUNNER_LEVEL_THRESHOLDS[lv] ?? currentThreshold;
  const range = nextThreshold - currentThreshold;
  const progress = totalDistanceMeters - currentThreshold;
  const ratio = range > 0 ? Math.max(0, Math.min(progress / range, 1)) : 0;
  return { current: totalDistanceMeters, next: nextThreshold, ratio, isMax: false };
}
