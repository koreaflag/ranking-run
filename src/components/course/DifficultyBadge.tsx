import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS, type DifficultyLevel } from '../../utils/constants';

interface DifficultyBadgeProps {
  difficulty: DifficultyLevel;
  size?: 'sm' | 'md';
}

export default function DifficultyBadge({ difficulty, size = 'sm' }: DifficultyBadgeProps) {
  const color = DIFFICULTY_COLORS[difficulty];
  const label = DIFFICULTY_LABELS[difficulty];
  const isMd = size === 'md';

  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }, isMd && styles.badgeMd]}>
      <Text style={[styles.label, { color }, isMd && styles.labelMd]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeMd: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelMd: {
    fontSize: 13,
  },
});
