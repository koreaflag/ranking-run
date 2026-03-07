import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface EmptyStateProps {
  icon?: string;
  ionicon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  description?: string;
}

export default function EmptyState({ icon, ionicon, iconColor, title, description }: EmptyStateProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {ionicon ? (
        <View style={[styles.iconCircle, { backgroundColor: (iconColor ?? colors.primary) + '18' }]}>
          <Ionicons name={ionicon} size={32} color={iconColor ?? colors.primary} />
        </View>
      ) : icon ? (
        <Text style={styles.icon}>{icon}</Text>
      ) : null}
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
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
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
