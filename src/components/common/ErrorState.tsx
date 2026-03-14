import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

interface ErrorStateProps {
  icon?: string;
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorState({ icon, title, description, onRetry, retryLabel }: ErrorStateProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {icon && (
        <View style={styles.iconCircle}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={32} color={colors.error} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryText}>{retryLabel ?? '다시 시도'}</Text>
        </TouchableOpacity>
      )}
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
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.error + '18',
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
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: c.primary,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: SPACING.md,
    },
    retryText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
