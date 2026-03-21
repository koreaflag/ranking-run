import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface OfflineBannerProps {
  isOnline: boolean;
}

const BANNER_HEIGHT = 30;

/**
 * A slim banner that slides in from the top when the device is offline.
 * Renders nothing when online (after the exit animation completes).
 */
export default function OfflineBanner({ isOnline }: OfflineBannerProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = insets.top + 4;
  const translateY = useRef(new Animated.Value(-(BANNER_HEIGHT + topOffset + 10))).current;
  const isVisible = useRef(false);

  useEffect(() => {
    if (!isOnline && !isVisible.current) {
      // Slide in
      isVisible.current = true;
      Animated.timing(translateY, {
        toValue: topOffset,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (isOnline && isVisible.current) {
      // Slide out
      Animated.timing(translateY, {
        toValue: -(BANNER_HEIGHT + topOffset + 10),
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        isVisible.current = false;
      });
    }
  }, [isOnline, translateY]);

  // Always render so the animation can run; the banner is off-screen when hidden.
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.error,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        <Ionicons
          name="cloud-offline-outline"
          size={14}
          color="#FFFFFF"
          style={styles.icon}
        />
        <Text style={styles.text}>오프라인 모드</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: BANNER_HEIGHT,
    borderRadius: 8,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
