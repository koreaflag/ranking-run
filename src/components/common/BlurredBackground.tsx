import React, { useMemo } from 'react';
import {
  View,
  ImageBackground,
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

export default function BlurredBackground({
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
    <ImageBackground
      source={{ uri }}
      style={[styles.container, style]}
      resizeMode="cover"
    >
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
          { backgroundColor: colors.glassOverlay },
        ]}
      />

      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
