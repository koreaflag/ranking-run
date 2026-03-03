import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface Props {
  currentKm: number;
  goalKm: number;
}

export default function WeeklyGoalBar({ currentKm, goalKm }: Props) {
  const colors = useTheme();
  const percent = goalKm > 0 ? Math.min((currentKm / goalKm) * 100, 100) : 0;
  const remaining = Math.max(0, goalKm - currentKm);
  const isComplete = currentKm >= goalKm;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.currentRow}>
          <Text style={[styles.currentValue, { color: colors.text }]}>
            {currentKm.toFixed(1)}
          </Text>
          <Text style={[styles.currentUnit, { color: colors.textTertiary }]}>
            / {goalKm} km
          </Text>
        </View>
        <Text style={[styles.percentText, {
          color: isComplete ? colors.success : colors.primary,
        }]}>
          {Math.round(percent)}%
        </Text>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.surfaceLight }]}>
        <View
          style={[styles.barFill, {
            width: `${percent}%`,
            backgroundColor: isComplete ? colors.success : colors.primary,
          }]}
        />
      </View>

      {!isComplete && (
        <View style={styles.statusRow}>
          <Ionicons name="footsteps-outline" size={12} color={colors.textTertiary} />
          <Text style={[styles.remainingText, { color: colors.textTertiary }]}>
            {remaining.toFixed(1)} km remaining
          </Text>
        </View>
      )}
      {isComplete && (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={[styles.remainingText, { color: colors.success }]}>
            Goal reached!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  currentValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  currentUnit: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  percentText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  remainingText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
  },
});
