import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../../utils/constants';
import { metersToKm } from '../../utils/format';

interface DistanceDisplayProps {
  distanceMeters: number;
}

export default function DistanceDisplay({
  distanceMeters,
}: DistanceDisplayProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>거리</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{metersToKm(distanceMeters)}</Text>
        <Text style={styles.unit}>km</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {
    fontSize: FONT_SIZES.hero,
    color: COLORS.text,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
