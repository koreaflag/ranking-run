import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import Mapbox from '@rnmapbox/maps';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '../../lib/icons';
import { courseService } from '../../services/courseService';
import { useCourseDetailStore } from '../../stores/courseDetailStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatDistance } from '../../utils/format';
import type { CourseStackParamList } from '../../types/navigation';

type CorrectRoute = RouteProp<CourseStackParamList, 'CourseRouteCorrect'>;

const MAX_DEVIATION_M = 50;
// Douglas-Peucker tolerance in degrees (~15m at equator)
const SIMPLIFY_TOLERANCE = 0.00015;
// Minimum number of simplified points to keep
const MIN_SIMPLIFIED_POINTS = 10;

// ---- Geometry helpers ----

function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minDistToPolyline(
  lat: number, lng: number,
  polyline: Array<{ latitude: number; longitude: number }>,
): number {
  let minDist = Infinity;
  for (const pt of polyline) {
    const d = haversineM(lat, lng, pt.latitude, pt.longitude);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Perpendicular distance from point to line segment (in degrees, approximate). */
function perpendicularDist(
  p: { latitude: number; longitude: number },
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.sqrt((p.longitude - a.longitude) ** 2 + (p.latitude - a.latitude) ** 2);
  }
  let t = ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.longitude + t * dx;
  const projY = a.latitude + t * dy;
  return Math.sqrt((p.longitude - projX) ** 2 + (p.latitude - projY) ** 2);
}

/** Douglas-Peucker simplification. Returns indices of kept points. */
function douglasPeuckerIndices(
  points: Array<{ latitude: number; longitude: number }>,
  tolerance: number,
): number[] {
  if (points.length <= 2) return points.map((_, i) => i);

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeuckerIndices(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeuckerIndices(points.slice(maxIdx), tolerance);
    // Offset right indices by maxIdx, skip first (duplicate of maxIdx)
    const rightOffset = right.slice(1).map((i) => i + maxIdx);
    return [...left, ...rightOffset];
  }

  return [0, points.length - 1];
}

/** Simplify route to key vertices using Douglas-Peucker. */
function simplifyRoute(
  points: Array<{ latitude: number; longitude: number }>,
  minPoints: number = MIN_SIMPLIFIED_POINTS,
): Array<{ latitude: number; longitude: number; originalIndex: number }> {
  if (points.length <= minPoints) {
    return points.map((p, i) => ({ ...p, originalIndex: i }));
  }

  let tolerance = SIMPLIFY_TOLERANCE;
  let indices = douglasPeuckerIndices(points, tolerance);

  // If too few points, reduce tolerance
  while (indices.length < minPoints && tolerance > 0.000001) {
    tolerance *= 0.5;
    indices = douglasPeuckerIndices(points, tolerance);
  }

  // If too many points (>60), increase tolerance
  while (indices.length > 60 && tolerance < 0.01) {
    tolerance *= 2;
    indices = douglasPeuckerIndices(points, tolerance);
  }

  return indices.map((i) => ({
    latitude: points[i].latitude,
    longitude: points[i].longitude,
    originalIndex: i,
  }));
}

// ---- Component ----

interface VertexPoint {
  latitude: number;
  longitude: number;
  originalIndex: number;
}

export default function CourseRouteCorrectScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<CorrectRoute>();
  const { courseId } = route.params;
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const selectedCourse = useCourseDetailStore((s) => s.selectedCourse);
  const fetchCourseDetail = useCourseDetailStore((s) => s.fetchCourseDetail);
  const hapticEnabled = useSettingsStore((s) => s.hapticFeedback);

  // Ensure course detail is loaded (e.g. when entering from RunDetailScreen)
  useEffect(() => {
    if (!selectedCourse || selectedCourse.id !== courseId) {
      fetchCourseDetail(courseId);
    }
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Original full route
  const originalRoute = useMemo<Array<{ latitude: number; longitude: number }>>(() => {
    if (!selectedCourse?.route_geometry?.coordinates) return [];
    return selectedCourse.route_geometry.coordinates.map((c: number[]) => ({
      latitude: c[1],
      longitude: c[0],
    }));
  }, [selectedCourse]);

  // Committed vertex positions (updated only on drag-end)
  const [vertices, setVertices] = useState<VertexPoint[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deviationError, setDeviationError] = useState<string | null>(null);
  // Live drag overlay — only the line reads this; PointAnnotation stays stable
  const [dragOverlay, setDragOverlay] = useState<{ index: number; lat: number; lng: number } | null>(null);
  // Bump this counter to force PointAnnotation remount only on revert
  const [vertexGeneration, setVertexGeneration] = useState(0);

  // Initialize simplified vertices from original route
  useEffect(() => {
    if (originalRoute.length > 0 && vertices.length === 0) {
      setVertices(simplifyRoute(originalRoute));
    }
  }, [originalRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build corrected route merging committed vertices + live drag position
  const correctedFullRoute = useMemo(() => {
    if (vertices.length === 0 || originalRoute.length === 0) return originalRoute;
    return vertices.map((v, i) => {
      if (dragOverlay && dragOverlay.index === i) {
        return { latitude: dragOverlay.lat, longitude: dragOverlay.lng };
      }
      return { latitude: v.latitude, longitude: v.longitude };
    });
  }, [vertices, originalRoute, dragOverlay]);

  // Camera bounds from original route with padding
  const routeBounds = useMemo(() => {
    if (originalRoute.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of originalRoute) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    // Add ~100m padding around the route
    const latPad = Math.max((maxLat - minLat) * 0.3, 0.001);
    const lngPad = Math.max((maxLng - minLng) * 0.3, 0.001);
    return {
      ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
      sw: [minLng - lngPad, minLat - latPad] as [number, number],
    };
  }, [originalRoute]);

  // GeoJSON for original route (faded reference)
  const originalGeoJSON = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: originalRoute.map((p) => [p.longitude, p.latitude]),
    },
  }), [originalRoute]);

  // GeoJSON for corrected route (active) — updates live during drag
  const correctedGeoJSON = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: correctedFullRoute.map((p) => [p.longitude, p.latitude]),
    },
  }), [correctedFullRoute]);

  // Haptic on drag start
  const handleVertexDragStart = useCallback((_index: number) => {
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [hapticEnabled]);

  // Live drag — only update overlay state (line follows), PointAnnotation key unchanged
  const handleVertexDrag = useCallback((index: number, event: any) => {
    const coords = event?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    setDragOverlay({ index, lat: coords[1], lng: coords[0] });
  }, []);

  // Validate on drag end — commit or revert
  const handleVertexDragEnd = useCallback((index: number, event: any) => {
    const coords = event?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      setDragOverlay(null);
      return;
    }

    const lng = coords[0];
    const lat = coords[1];
    setDragOverlay(null);

    const dist = minDistToPolyline(lat, lng, originalRoute);
    if (dist > MAX_DEVIATION_M) {
      setDeviationError(t('course.detail.routeDeviationError', { max: MAX_DEVIATION_M, actual: Math.round(dist) }));
      if (hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      // Force PointAnnotation remount at old position (revert)
      setVertexGeneration((g) => g + 1);
      return;
    }

    setDeviationError(null);
    if (hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVertices((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], latitude: lat, longitude: lng };
      return updated;
    });
  }, [originalRoute, t, hapticEnabled]);

  const handleReset = useCallback(() => {
    setVertices(simplifyRoute(originalRoute));
    setDragOverlay(null);
    setDeviationError(null);
    setVertexGeneration((g) => g + 1);
  }, [originalRoute]);

  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: reset CourseStack to CourseDetail (parent screen)
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'CourseList' },
            { name: 'CourseDetail', params: { courseId } },
          ],
        }),
      );
    }
  }, [navigation, courseId]);

  const handleSave = useCallback(async () => {
    if (correctedFullRoute.length < 2) return;

    setIsSaving(true);
    try {
      const coordinates: [number, number, number][] = correctedFullRoute.map((p) => [
        p.longitude, p.latitude, 0,
      ]);
      await courseService.correctRoute(courseId, coordinates);
      fetchCourseDetail(courseId);
      Alert.alert(t('course.detail.routeCorrected'), '', [
        { text: t('common.confirm'), onPress: safeGoBack },
      ]);
    } catch (err: any) {
      if (__DEV__) console.error('[CourseRouteCorrect] save error:', err?.status, JSON.stringify(err?.data));
      const msg = err?.data?.message ?? err?.data?.detail ?? err?.message ?? t('common.errorRetry');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsSaving(false);
    }
  }, [correctedFullRoute, courseId, fetchCourseDetail, safeGoBack, t]);

  const correctedDistance = useMemo(() => {
    let total = 0;
    for (let i = 1; i < correctedFullRoute.length; i++) {
      total += haversineM(
        correctedFullRoute[i - 1].latitude, correctedFullRoute[i - 1].longitude,
        correctedFullRoute[i].latitude, correctedFullRoute[i].longitude,
      );
    }
    return total;
  }, [correctedFullRoute]);

  if (!selectedCourse || originalRoute.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={safeGoBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('course.detail.routeCorrection')}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving || correctedFullRoute.length < 2}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveBtn, (correctedFullRoute.length < 2) && { opacity: 0.4 }]}>
              {t('common.save')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color={colors.primary} />
        <Text style={styles.infoText}>
          {t('course.detail.routeCorrectionGuide', { max: MAX_DEVIATION_M })}
        </Text>
      </View>

      {/* Deviation error */}
      {deviationError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={14} color={COLORS.white} />
          <Text style={styles.errorText}>{deviationError}</Text>
        </View>
      )}

      {/* Map with Mapbox directly */}
      <View style={styles.mapContainer}>
        <Mapbox.MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/outdoors-v12"
          compassEnabled={false}
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Mapbox.Camera
            defaultSettings={{
              bounds: routeBounds ? { ne: routeBounds.ne, sw: routeBounds.sw, paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 } : undefined,
            }}
            maxBounds={routeBounds ? { ne: routeBounds.ne, sw: routeBounds.sw } : undefined}
            minZoomLevel={12}
          />

          {/* Original route — faded gray */}
          <Mapbox.ShapeSource id="original-route" shape={originalGeoJSON}>
            <Mapbox.LineLayer
              id="original-route-line"
              style={{
                lineColor: '#8E8E93',
                lineWidth: 3,
                lineOpacity: 0.4,
                lineDasharray: [4, 3],
              }}
            />
          </Mapbox.ShapeSource>

          {/* Corrected route — bold orange */}
          <Mapbox.ShapeSource id="corrected-route" shape={correctedGeoJSON}>
            <Mapbox.LineLayer
              id="corrected-route-line"
              style={{
                lineColor: COLORS.primary,
                lineWidth: 4,
                lineOpacity: 0.9,
              }}
            />
          </Mapbox.ShapeSource>

          {/* Draggable vertex handles */}
          {vertices.map((vertex, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === vertices.length - 1;

            return (
              <Mapbox.PointAnnotation
                key={`v${idx}-g${vertexGeneration}`}
                id={`vertex-${idx}`}
                coordinate={[vertex.longitude, vertex.latitude]}
                draggable
                onDragStart={() => handleVertexDragStart(idx)}
                onDrag={(e: any) => handleVertexDrag(idx, e)}
                onDragEnd={(e: any) => handleVertexDragEnd(idx, e)}
              >
                <View
                  style={[
                    styles.vertexHandle,
                    isFirst && styles.vertexStart,
                    isLast && styles.vertexEnd,
                    !isFirst && !isLast && styles.vertexMid,
                  ]}
                >
                  {isFirst && <Text style={styles.vertexLabel}>S</Text>}
                  {isLast && <Text style={styles.vertexLabel}>E</Text>}
                </View>
              </Mapbox.PointAnnotation>
            );
          })}
        </Mapbox.MapView>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: '#8E8E93' }]} />
          <Text style={styles.legendText}>{t('course.detail.originalRoute')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>{t('course.detail.correctedRoute')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
          <Text style={styles.legendText}>{t('course.detail.startPoint')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
          <Text style={styles.legendText}>{t('course.detail.endPoint')}</Text>
        </View>
      </View>

      {/* Bottom toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.distanceInfo}>
          <Text style={styles.distanceLabel}>{t('course.detail.correctedDistance')}</Text>
          <Text style={styles.distanceValue}>{formatDistance(correctedDistance)}</Text>
        </View>
        <View style={styles.toolbarActions}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleReset} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
  },
  saveBtn: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.primary,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#FF3B30',
    borderRadius: BORDER_RADIUS.md,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.white,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  // Draggable vertex handle styles
  vertexHandle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  vertexStart: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  vertexEnd: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  vertexMid: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  vertexLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
  },
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  legendText: {
    fontSize: 10,
    color: c.textTertiary,
    fontWeight: '500',
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  distanceInfo: {
    gap: 2,
  },
  distanceLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '500',
  },
  distanceValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
});
