import React, { useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { BORDER_RADIUS, SPACING } from '../../utils/constants';

interface GlassCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  /** Enable BlurView backdrop (use when over an image background) */
  overImage?: boolean;
  blurIntensity?: number;
}

export default function GlassCard({
  children,
  onPress,
  style,
  padded = true,
  overImage = false,
  blurIntensity = 40,
}: GlassCardProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDark = colors.statusBar === 'light-content';

  const content = (
    <View style={[styles.wrapper, style]}>
      {/* Optional blur backdrop for cards over image backgrounds */}
      {overImage && Platform.OS === 'ios' && (
        <BlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Glass surface */}
      <View style={[styles.surface, padded && styles.padded]}>
        {/* Top highlight line (light reflection) */}
        <View style={styles.topHighlight} />
        {children}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    surface: {
      backgroundColor: c.glassBackground,
      borderWidth: 1,
      borderColor: c.glassBorder,
      borderRadius: BORDER_RADIUS.lg,
    },
    padded: {
      padding: SPACING.xl,
    },
    topHighlight: {
      position: 'absolute',
      top: 0,
      left: SPACING.lg,
      right: SPACING.lg,
      height: 1,
      backgroundColor:
        c.statusBar === 'light-content'
          ? 'rgba(255, 255, 255, 0.12)'
          : 'rgba(255, 255, 255, 0.8)',
      borderRadius: 0.5,
    },
  });
