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
    color: COLORS.runTextSecondary,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {
    fontSize: 72,
    color: COLORS.runText,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    lineHeight: 80,
  },
  unit: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.runTextSecondary,
    fontWeight: '700',
  },
});
