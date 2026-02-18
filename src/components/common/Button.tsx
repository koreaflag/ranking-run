import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  leftIcon,
}: ButtonProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const containerStyles: ViewStyle[] = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const labelStyles: TextStyle[] = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
    disabled && styles.labelDisabled,
    textStyle as TextStyle,
  ].filter(Boolean) as TextStyle[];

  const indicatorColor =
    variant === 'primary' ? COLORS.white : colors.text;

  return (
    <TouchableOpacity
      style={containerStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={indicatorColor}
        />
      ) : (
        <>
          {leftIcon}
          <Text style={labelStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.full,
      gap: SPACING.sm,
    },
    fullWidth: {
      width: '100%',
    },
    disabled: {
      opacity: 0.4,
    },

    // -- Variants --
    variant_primary: {
      backgroundColor: c.primary,
      ...SHADOWS.md,
    },
    variant_secondary: {
      backgroundColor: c.surface,
    },
    variant_outline: {
      backgroundColor: COLORS.transparent,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    variant_ghost: {
      backgroundColor: COLORS.transparent,
    },

    // -- Sizes --
    size_sm: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      minHeight: 36,
    },
    size_md: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      minHeight: 48,
    },
    size_lg: {
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xxl,
      minHeight: 56,
    },

    // -- Labels --
    label: {
      fontWeight: '700',
    },
    label_primary: {
      color: COLORS.white,
    },
    label_secondary: {
      color: c.text,
    },
    label_outline: {
      color: c.text,
    },
    label_ghost: {
      color: c.textSecondary,
    },
    labelDisabled: {
      opacity: 0.7,
    },
    labelSize_sm: {
      fontSize: FONT_SIZES.sm,
    },
    labelSize_md: {
      fontSize: FONT_SIZES.lg,
    },
    labelSize_lg: {
      fontSize: FONT_SIZES.xl,
    },
  });
