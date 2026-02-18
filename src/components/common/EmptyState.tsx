import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xxxl,
      gap: SPACING.md,
    },
    icon: {
      fontSize: 48,
      marginBottom: SPACING.sm,
    },
    title: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
    },
    description: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
