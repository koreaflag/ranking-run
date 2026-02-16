import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '../../utils/constants';

/**
 * RouteMapView is a wrapper around react-native-maps that shows a running route.
 *
 * On devices with react-native-maps installed, this will render an actual MapView
 * with polyline overlay. For now, it renders a styled placeholder that will be
 * replaced once the maps library is properly linked in the native build.
 */

interface RouteMapViewProps {
  routePoints?: Array<{ latitude: number; longitude: number }>;
  showUserLocation?: boolean;
  style?: object;
  interactive?: boolean;
}

export default function RouteMapView({
  routePoints = [],
  style,
}: RouteMapViewProps) {
  // Placeholder rendering for builds without react-native-maps configured
  const pointCount = routePoints.length;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapIcon}>🗺</Text>
        {pointCount > 0 ? (
          <Text style={styles.mapText}>
            경로 포인트 {pointCount}개 표시 중
          </Text>
        ) : (
          <Text style={styles.mapText}>지도가 여기에 표시됩니다</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  mapPlaceholder: {
    flex: 1,
    minHeight: 200,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  mapIcon: {
    fontSize: 40,
  },
  mapText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});
