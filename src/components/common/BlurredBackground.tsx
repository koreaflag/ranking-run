import React, { useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../hooks/useTheme';

interface BlurredBackgroundProps {
  children: React.ReactNode;
  intensity?: number;
  style?: ViewStyle;
  /** Override the stored background image URI */
  imageUri?: string | null;
}

/**
 * Static blur layer — only re-renders when uri/intensity/theme changes.
 * Children changes do NOT cause this layer to re-render.
 */
const BlurLayer = React.memo(function BlurLayer({
  uri,
  intensity,
  isDark,
  glassOverlay,
}: {
  uri: string;
  intensity: number;
  isDark: boolean;
  glassOverlay: string;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      {/* Blur layer */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(10, 10, 10, 0.85)'
                : 'rgba(245, 245, 245, 0.9)',
            },
          ]}
        />
      )}

      {/* Color overlay for readability */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: glassOverlay },
        ]}
      />
    </View>
  );
});

function BlurredBackground({
  children,
  intensity = 80,
  style,
  imageUri,
}: BlurredBackgroundProps) {
  const colors = useTheme();
  const storedUri = useSettingsStore((s) => s.backgroundImageUri);
  const uri = imageUri !== undefined ? imageUri : storedUri;
  const isDark = colors.statusBar === 'light-content';

  if (!uri) {
    // No background image — plain background fallback
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <BlurLayer
        uri={uri}
        intensity={intensity}
        isDark={isDark}
        glassOverlay={colors.glassOverlay}
      />
      {children}
    </View>
  );
}

export default React.memo(BlurredBackground);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
