import React, { useMemo, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { MAPBOX_ACCESS_TOKEN } from '../../config/env';


interface CourseThumbnailMapProps {
  routePreview: number[][]; // [[lng, lat], ...]
  width: number;
  height: number;
  borderRadius?: number;
}

/** Downsample points array to at most maxPts, keeping first and last. */
function downsample(pts: number[][], maxPts: number): number[][] {
  if (pts.length <= maxPts) return pts;
  const step = (pts.length - 1) / (maxPts - 1);
  const result: number[][] = [];
  for (let i = 0; i < maxPts - 1; i++) {
    result.push(pts[Math.round(i * step)]);
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/** Build a Mapbox Static Images API URL with a GeoJSON line overlay. */
function buildStaticMapUrl(
  pts: number[][],
  styleId: string,
  pixelW: number,
  pixelH: number,
  decimals: number,
): string {
  const geojson = encodeURIComponent(JSON.stringify({
    type: 'Feature',
    properties: {
      stroke: '#FFC800',
      'stroke-width': 3,
      'stroke-opacity': 1,
    },
    geometry: {
      type: 'LineString',
      coordinates: pts.map(([lng, lat]) => [
        parseFloat(lng.toFixed(decimals)),
        parseFloat(lat.toFixed(decimals)),
      ]),
    },
  }));
  return `https://api.mapbox.com/styles/v1/${styleId}/static/geojson(${geojson})/auto/${pixelW}x${pixelH}@2x?padding=20&logo=false&attribution=false&access_token=${MAPBOX_ACCESS_TOKEN}`;
}

/**
 * Route thumbnail using Mapbox Static Images API.
 * Renders a real map background with the route overlaid, but as a plain
 * <Image> — zero GPU/memory overhead unlike a full MapView.
 */
export default React.memo(function CourseThumbnailMap({
  routePreview,
  width,
  height,
  borderRadius = 8,
}: CourseThumbnailMapProps) {
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';
  const bgColor = isDark ? '#1C1C1E' : '#F2F2F7';

  const imageUri = useMemo(() => {
    if (!routePreview || routePreview.length < 2 || !MAPBOX_ACCESS_TOKEN) return null;

    const styleId = isDark
      ? 'mapbox/dark-v11'
      : 'mapbox/light-v11';

    const pixelW = Math.min(Math.round(width * 2), 640);
    const pixelH = Math.min(Math.round(height * 2), 640);

    // First attempt: 60 points, 5 decimal places
    let pts = downsample(routePreview, 60);
    let url = buildStaticMapUrl(pts, styleId, pixelW, pixelH, 5);

    // If URL too long, reduce points and precision
    if (url.length > 8000) {
      pts = downsample(routePreview, 30);
      url = buildStaticMapUrl(pts, styleId, pixelW, pixelH, 4);
    }

    return url;
  }, [routePreview, width, height, isDark]);

  const [failed, setFailed] = useState(false);

  if (!imageUri || failed) {
    return <View style={[styles.container, { width, height, borderRadius, backgroundColor: bgColor }]} />;
  }

  return (
    <View style={[styles.container, { width, height, borderRadius, backgroundColor: bgColor }]}>
      <Image
        source={{ uri: imageUri }}
        style={{ width, height }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
