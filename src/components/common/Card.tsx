import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
}

export default function Card({
  children,
  onPress,
  style,
  padded = true,
}: CardProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const containerStyle: ViewStyle[] = [
    styles.card,
    padded && styles.padded,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <TouchableOpacity
        style={containerStyle}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={containerStyle}>{children}</View>;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.sm,
    },
    padded: {
      padding: SPACING.xl,
    },
  });
