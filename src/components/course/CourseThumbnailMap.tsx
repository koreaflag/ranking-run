import React, { useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { useTheme } from '../../hooks/useTheme';
import { MAPBOX_DARK_STYLE, MAPBOX_LIGHT_STYLE } from '../../config/env';

let _thumbIdCounter = 0;

interface CourseThumbnailMapProps {
  routePreview: number[][]; // [[lng, lat], ...]
  width: number;
  height: number;
  borderRadius?: number;
}

export default React.memo(function CourseThumbnailMap({
  routePreview,
  width,
  height,
  borderRadius = 8,
}: CourseThumbnailMapProps) {
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';
  const styleURL = isDark ? MAPBOX_DARK_STYLE : MAPBOX_LIGHT_STYLE;

  // Unique IDs per instance to avoid Mapbox native layer conflicts
  const idRef = useRef(`thumb-${++_thumbIdCounter}`);
  const sourceId = idRef.current;
  const layerId = `${idRef.current}-line`;

  const routeGeoJSON = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routePreview,
      },
    }),
    [routePreview],
  );

  // Calculate bounds from route
  const bounds = useMemo(() => {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of routePreview) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // Add padding in degrees (~50m)
    const padLng = Math.max((maxLng - minLng) * 0.15, 0.0005);
    const padLat = Math.max((maxLat - minLat) * 0.15, 0.0005);
    return {
      ne: [maxLng + padLng, maxLat + padLat] as [number, number],
      sw: [minLng - padLng, minLat - padLat] as [number, number],
    };
  }, [routePreview]);

  return (
    <View style={[styles.container, { width, height, borderRadius }]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        zoomEnabled={false}
      >
        <Mapbox.Camera
          bounds={bounds}
          animationDuration={0}
        />
        <Mapbox.ShapeSource id={sourceId} shape={routeGeoJSON}>
          <Mapbox.LineLayer
            id={layerId}
            style={{
              lineColor: '#FFC800',
              lineWidth: 3,
              lineCap: 'round',
              lineJoin: 'round',
              lineEmissiveStrength: 1,
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
});
