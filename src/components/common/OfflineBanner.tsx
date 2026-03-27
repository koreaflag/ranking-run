import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { useNetworkStore } from '../../stores/networkStore';
import { FONT_SIZES, SPACING } from '../../utils/constants';

const BANNER_HEIGHT = 30;

/**
 * A slim banner that slides in from the top when the device is offline.
 * Shows pending sync count when items are waiting to upload.
 * No props needed — reads directly from networkStore.
 */
export default function OfflineBanner() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const pendingCount = useNetworkStore((s) => s.pendingCount);
  const isSyncing = useNetworkStore((s) => s.isSyncing);

  const topOffset = insets.top + 4;
  const translateY = useRef(new Animated.Value(-(BANNER_HEIGHT + topOffset + 10))).current;
  const isVisible = useRef(false);

  // Show banner when offline OR when syncing pending data
  const shouldShow = !isOnline || (pendingCount > 0 && isSyncing);

  useEffect(() => {
    if (shouldShow && !isVisible.current) {
      isVisible.current = true;
      Animated.timing(translateY, {
        toValue: topOffset,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (!shouldShow && isVisible.current) {
      Animated.timing(translateY, {
        toValue: -(BANNER_HEIGHT + topOffset + 10),
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        isVisible.current = false;
      });
    }
  }, [shouldShow, translateY]);

  const label = !isOnline
    ? pendingCount > 0
      ? `오프라인 · ${pendingCount}건 대기 중`
      : '오프라인 모드'
    : `동기화 중... ${pendingCount}건`;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: !isOnline ? colors.error : (colors.warning ?? '#F5A623'),
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        <Ionicons
          name={!isOnline ? 'cloud-offline-outline' : 'cloud-upload-outline'}
          size={14}
          color="#FFFFFF"
          style={styles.icon}
        />
        <Text style={styles.text}>{label}</Text>
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
