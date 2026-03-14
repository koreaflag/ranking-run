import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';

/**
 * Crew tier configuration by level range.
 *
 *  Lv.1-2  Bronze   — warm copper tones
 *  Lv.3-4  Silver   — cool steel
 *  Lv.5-6  Gold     — rich gold
 *  Lv.7-8  Platinum — icy blue
 *  Lv.9-10 Legend   — deep violet
 */
type TierConfig = {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: string;
  iconColor: string;
};

const TIERS: TierConfig[] = [
  // Lv.1-2: Bronze
  { label: 'Bronze', bg: '#3D2B1F', border: '#CD7F32', text: '#CD7F32', icon: 'shield-outline', iconColor: '#CD7F32' },
  // Lv.3-4: Silver
  { label: 'Silver', bg: '#2A2D30', border: '#A8B2BD', text: '#C0C8D0', icon: 'shield-half-outline', iconColor: '#C0C8D0' },
  // Lv.5-6: Gold
  { label: 'Gold', bg: '#3A2F0E', border: '#D4A017', text: '#FFD700', icon: 'shield', iconColor: '#FFD700' },
  // Lv.7-8: Platinum
  { label: 'Platinum', bg: '#0E2A3A', border: '#4FC3F7', text: '#B3E5FC', icon: 'diamond-outline', iconColor: '#B3E5FC' },
  // Lv.9-10: Legend
  { label: 'Legend', bg: '#2A0E3A', border: '#BA68C8', text: '#E1BEE7', icon: 'trophy', iconColor: '#E1BEE7' },
];

function getTier(level: number): TierConfig {
  const lv = level ?? 1;
  if (lv <= 2) return TIERS[0];
  if (lv <= 4) return TIERS[1];
  if (lv <= 6) return TIERS[2];
  if (lv <= 8) return TIERS[3];
  return TIERS[4];
}

type Size = 'sm' | 'md';

const SIZES = {
  sm: { height: 22, iconSize: 11, fontSize: 10, px: 6, gap: 3, radius: 6 },
  md: { height: 26, iconSize: 13, fontSize: 12, px: 8, gap: 4, radius: 8 },
};

type Props = {
  level?: number;
  size?: Size;
};

export default function CrewLevelBadge({ level, size = 'md' }: Props) {
  const lv = level ?? 1;
  const tier = getTier(lv);
  const s = SIZES[size];

  return (
    <View
      style={[
        styles.badge,
        {
          height: s.height,
          paddingHorizontal: s.px,
          borderRadius: s.radius,
          backgroundColor: tier.bg,
          borderColor: tier.border,
        },
      ]}
    >
      <Ionicons name={tier.icon as any} size={s.iconSize} color={tier.iconColor} />
      <Text
        style={[
          styles.text,
          { fontSize: s.fontSize, color: tier.text, marginLeft: s.gap },
        ]}
      >
        Lv.{lv}
      </Text>
    </View>
  );
}

export { getTier, TIERS };
export type { TierConfig };

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
