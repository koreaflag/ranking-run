import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../../utils/constants';
import { formatPace } from '../../utils/format';

interface PaceDisplayProps {
  paceSecondsPerKm: number;
  label?: string;
}

export default function PaceDisplay({
  paceSecondsPerKm,
  label = '현재 페이스',
}: PaceDisplayProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{formatPace(paceSecondsPerKm)}</Text>
      <Text style={styles.unit}>min/km</Text>
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
  value: {
    fontSize: 32,
    color: COLORS.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
  },
});
