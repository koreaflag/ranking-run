import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface StatItemProps {
  label: string;
  value: string;
  unit?: string;
  large?: boolean;
}

export default function StatItem({ label, value, unit, large = false }: StatItemProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, large && styles.valueLarge]}>{value}</Text>
        {unit && <Text style={[styles.unit, large && styles.unitLarge]}>{unit}</Text>}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      gap: SPACING.xs,
    },
    label: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    value: {
      fontSize: FONT_SIZES.xl,
      color: c.text,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    valueLarge: {
      fontSize: FONT_SIZES.title,
      color: c.text,
      fontWeight: '800',
    },
    unit: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      fontWeight: '500',
    },
    unitLarge: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
    },
  });
