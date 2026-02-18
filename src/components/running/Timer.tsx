import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../../utils/constants';
import { formatDuration } from '../../utils/format';

interface TimerProps {
  durationSeconds: number;
  label?: string;
}

export default function Timer({
  durationSeconds,
  label = '시간',
}: TimerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{formatDuration(durationSeconds)}</Text>
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
  value: {
    fontSize: 30,
    color: COLORS.runText,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
