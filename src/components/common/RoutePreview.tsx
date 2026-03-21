import React, { useMemo, useState } from 'react';
import { View, Image, StyleSheet, PixelRatio } from 'react-native';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_DARK_STYLE } from '../../config/env';

interface RoutePreviewProps {
  /** Array of [lng, lat] pairs */
  coordinates: number[][];
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** Show Mapbox map background behind the route */
  showMap?: boolean;
}

/** Google polyline encoding for Mapbox Static API */
function encodePolyline(coordinates: number[][]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lng, lat] of coordinates) {
    const latVal = Math.round(lat * 1e5);
    const lngVal = Math.round(lng * 1e5);
    encoded += encodeSigned(latVal - prevLat);
    encoded += encodeSigned(lngVal - prevLng);
    prevLat = latVal;
    prevLng = lngVal;
  }
  return encoded;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

function buildStaticMapUrl(
  coordinates: number[][],
  width: number,
  height: number,
  strokeColor: string,
  strokeWidth: number,
): string | null {
  if (!MAPBOX_ACCESS_TOKEN || coordinates.length < 2) return null;

  // Use default Mapbox style for Static API (custom styles don't render tiles)
  const stylePath = 'mapbox/dark-v11';

  const color = strokeColor.replace('#', '');
  const poly = encodeURIComponent(encodePolyline(coordinates));

  const ratio = PixelRatio.get() >= 2 ? '@2x' : '';

  return (
    `https://api.mapbox.com/styles/v1/${stylePath}/static/` +
    `path-${strokeWidth}+${color}-1(${poly})/auto/${width}x${height}${ratio}` +
    `?access_token=${MAPBOX_ACCESS_TOKEN}&padding=10,10,10,10`
  );
}

export default function RoutePreview({
  coordinates,
  width,
  height,
  strokeColor = '#FFC800',
  strokeWidth = 2,
  showMap = false,
}: RoutePreviewProps) {
  const [mapFailed, setMapFailed] = useState(false);

  const mapUrl = useMemo(() => {
    if (!showMap) return null;
    return buildStaticMapUrl(coordinates, width, height, strokeColor, strokeWidth);
  }, [showMap, coordinates, width, height, strokeColor, strokeWidth]);

  const useMap = mapUrl && !mapFailed;

  const points = useMemo(() => {
    if (useMap || !coordinates || coordinates.length < 2) return [];

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coordinates) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const lngRange = maxLng - minLng || 0.0001;
    const latRange = maxLat - minLat || 0.0001;
    const pad = 4;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;
    const scaleX = drawW / lngRange;
    const scaleY = drawH / latRange;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = pad + (drawW - lngRange * scale) / 2;
    const offsetY = pad + (drawH - latRange * scale) / 2;

    return coordinates.map(([lng, lat]) => ({
      x: offsetX + (lng - minLng) * scale,
      y: offsetY + (maxLat - lat) * scale,
    }));
  }, [useMap, coordinates, width, height]);

  const segments = useMemo(() => {
    if (points.length < 2) return [];
    const segs: { x: number; y: number; length: number; angle: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 0.5) continue;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      segs.push({ x: p1.x, y: p1.y, length, angle });
    }
    return segs;
  }, [points]);

  // Mapbox Static API mode — map + route drawn by Mapbox
  if (useMap) {
    return (
      <Image
        source={{ uri: mapUrl }}
        style={[styles.mapImage, { width, height, borderRadius: 6 }]}
        resizeMode="cover"
        onError={() => setMapFailed(true)}
      />
    );
  }

  // Fallback: View-based polyline rendering (no map background)
  if (points.length < 2) return null;

  return (
    <View style={[styles.container, { width, height }]}>
      {segments.map((seg, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: seg.x,
            top: seg.y - strokeWidth / 2,
            width: seg.length,
            height: strokeWidth,
            backgroundColor: strokeColor,
            borderRadius: strokeWidth / 2,
            transform: [{ rotate: `${seg.angle}deg` }],
            transformOrigin: 'left center',
          }}
        />
      ))}
      <View
        style={[
          styles.dot,
          {
            left: points[0].x - 3,
            top: points[0].y - 3,
            backgroundColor: strokeColor,
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            left: points[points.length - 1].x - 3,
            top: points[points.length - 1].y - 3,
            backgroundColor: strokeColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mapImage: {
    backgroundColor: '#1a1a2e',
  },
});
