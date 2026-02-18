import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function ScreenHeader({
  title,
  onBack,
  rightAction,
}: ScreenHeaderProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rightSection}>{rightAction}</View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      paddingTop: SPACING.lg,
      backgroundColor: c.background,
    },
    leftSection: {
      width: 44,
      alignItems: 'flex-start',
    },
    rightSection: {
      width: 44,
      alignItems: 'flex-end',
    },
    title: {
      flex: 1,
      fontSize: FONT_SIZES.xl,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
    },
    backButton: {
      padding: SPACING.xs,
    },
  });
