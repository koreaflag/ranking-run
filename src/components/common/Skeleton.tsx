import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

// ============================================================
// Shared pulse animation hook
// ============================================================

function usePulse() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return opacity;
}

// ============================================================
// SkeletonBox - animated placeholder box
// ============================================================

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width, height, borderRadius = 8, style }: SkeletonBoxProps) {
  const colors = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ============================================================
// SkeletonText - text line placeholder
// ============================================================

interface SkeletonTextProps {
  width?: number | string;
  height?: number;
  style?: ViewStyle;
}

export function SkeletonText({ width = '100%', height = 14, style }: SkeletonTextProps) {
  const colors = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: height / 2,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ============================================================
// SkeletonCircle - circular placeholder (for avatars)
// ============================================================

interface SkeletonCircleProps {
  size: number;
  style?: ViewStyle;
}

export function SkeletonCircle({ size, style }: SkeletonCircleProps) {
  const colors = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ============================================================
// SkeletonCard - card-shaped placeholder
// ============================================================

interface SkeletonCardProps {
  height?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function SkeletonCard({ height = 120, style, children }: SkeletonCardProps) {
  const colors = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          height: children ? undefined : height,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ============================================================
// ListEndIndicator - shown when infinite scroll reaches the end
// ============================================================

interface ListEndIndicatorProps {
  text: string;
  style?: ViewStyle;
}

export function ListEndIndicator({ text, style }: ListEndIndicatorProps) {
  const colors = useTheme();

  return (
    <View style={[styles.endContainer, style]}>
      <View style={[styles.endLine, { backgroundColor: colors.border }]} />
      <View style={styles.endTextContainer}>
        <View style={[styles.endDot, { backgroundColor: colors.textTertiary }]} />
        <Animated.Text style={[styles.endText, { color: colors.textTertiary }]}>
          {text}
        </Animated.Text>
        <View style={[styles.endDot, { backgroundColor: colors.textTertiary }]} />
      </View>
      <View style={[styles.endLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  endContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 4,
    gap: 12,
  },
  endLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  endTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  endDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  endText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
