import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions, useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import GlassCard from '../../components/common/GlassCard';
import SplitBarsChart from '../../components/charts/SplitBarsChart';
import RouteMapView from '../../components/map/RouteMapView';
import type { RouteMapViewHandle } from '../../components/map/RouteMapView';
import type { MyPageStackParamList } from '../../types/navigation';
import type { RunRecordDetail, Split } from '../../types/api';
import { userService } from '../../services/userService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
  formatDate,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { MAPBOX_ACCESS_TOKEN } from '../../config/env';

type DetailRoute = RouteProp<MyPageStackParamList, 'RunDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---- Static map helpers (Mapbox Static Images API) ----

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

function buildDetailStaticMapUrl(
  coordinates: number[][],
  styleId: string,
  pixelW: number,
  pixelH: number,
): string | null {
  if (!MAPBOX_ACCESS_TOKEN || coordinates.length < 2) return null;

  // Downsample to keep URL under limits; 120 points gives good detail for large maps
  let pts = downsample(coordinates, 120);
  const geojson = JSON.stringify({
    type: 'Feature',
    properties: {
      stroke: '#FFC800',
      'stroke-width': 4,
      'stroke-opacity': 1,
    },
    geometry: {
      type: 'LineString',
      coordinates: pts.map(([lng, lat]) => [
        parseFloat(lng.toFixed(5)),
        parseFloat(lat.toFixed(5)),
      ]),
    },
  });

  let encoded = encodeURIComponent(geojson);
  let url =
    `https://api.mapbox.com/styles/v1/${styleId}/static/` +
    `geojson(${encoded})/auto/${pixelW}x${pixelH}@2x` +
    `?padding=30&logo=false&attribution=false&access_token=${MAPBOX_ACCESS_TOKEN}`;

  // If URL too long, reduce points
  if (url.length > 8000) {
    pts = downsample(coordinates, 60);
    const geojson2 = JSON.stringify({
      type: 'Feature',
      properties: { stroke: '#FFC800', 'stroke-width': 4, 'stroke-opacity': 1 },
      geometry: {
        type: 'LineString',
        coordinates: pts.map(([lng, lat]) => [
          parseFloat(lng.toFixed(4)),
          parseFloat(lat.toFixed(4)),
        ]),
      },
    });
    encoded = encodeURIComponent(geojson2);
    url =
      `https://api.mapbox.com/styles/v1/${styleId}/static/` +
      `geojson(${encoded})/auto/${pixelW}x${pixelH}@2x` +
      `?padding=30&logo=false&attribution=false&access_token=${MAPBOX_ACCESS_TOKEN}`;
  }

  return url;
}

function getTimeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${period} ${h12}:${m.toString().padStart(2, '0')}`;
}

export default function RunDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { runId } = route.params;
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef<RouteMapViewHandle>(null);
  const isFocused = useIsFocused();

  const [detail, setDetail] = useState<RunRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await userService.getRunDetail(runId);
        setDetail(data);
      } catch (e) {
        console.warn('[RunDetail] API error:', e);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  const routePoints = useMemo(() => {
    if (!detail?.route_geometry?.coordinates) return [];
    return detail.route_geometry.coordinates.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));
  }, [detail]);

  // Compute split km markers along the route for map visualization
  const splitMapMarkers = useMemo(() => {
    const splits = detail?.splits;
    if (!routePoints.length || !splits?.length) return [];
    const markers: Array<{ km: number; latitude: number; longitude: number; pace?: string }> = [];
    let cumulDist = 0;
    let nextKm = 1;
    const splitMap = new Map(splits.map((s: Split) => [s.split_number, s]));

    for (let i = 1; i < routePoints.length && nextKm <= splits.length; i++) {
      const prev = routePoints[i - 1];
      const curr = routePoints[i];
      const dLat = (curr.latitude - prev.latitude) * Math.PI / 180;
      const dLng = (curr.longitude - prev.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(prev.latitude * Math.PI / 180) * Math.cos(curr.latitude * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      const segDist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const prevCumul = cumulDist;
      cumulDist += segDist;

      while (nextKm * 1000 <= cumulDist && nextKm <= splits.length) {
        const ratio = (nextKm * 1000 - prevCumul) / segDist;
        const lat = prev.latitude + ratio * (curr.latitude - prev.latitude);
        const lng = prev.longitude + ratio * (curr.longitude - prev.longitude);
        const split = splitMap.get(nextKm);
        const pace = split ? formatPace(split.pace_seconds_per_km) : undefined;
        markers.push({ km: nextKm, latitude: lat, longitude: lng, pace });
        nextKm++;
      }
    }
    return markers;
  }, [routePoints, detail]);

  // Build static map URL for lightweight preview (avoids heavy MapView)
  const staticMapUrl = useMemo(() => {
    if (!detail?.route_geometry?.coordinates || detail.route_geometry.coordinates.length < 2) {
      return null;
    }
    const isDark = colors.statusBar === 'light-content';
    const styleId = isDark
      ? 'mapbox/dark-v11'
      : 'mapbox/light-v11';

    const mapW = Math.round(SCREEN_WIDTH - SPACING.xxl * 2);
    const pixelW = Math.min(mapW, 640);
    const pixelH = Math.min(mapW, 640);

    return buildDetailStaticMapUrl(
      detail.route_geometry.coordinates,
      styleId,
      pixelW,
      pixelH,
    );
  }, [detail, colors]);

  // Unmount the interactive map when navigating away to free GPU memory
  const showInteractiveMap = mapExpanded && isFocused;

  const headerLabel = useMemo(() => {
    if (!detail) return '';
    if (detail.course) return detail.course.title;
    return t('mypage.freeRunning');
  }, [detail, t]);

  if (loading) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  if (error || !detail) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.errorText}>{t('common.error')}</Text>
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>{headerLabel}</Text>
              <Text style={styles.headerDate}>
                {formatDate(detail.started_at)} {getTimeLabel(detail.started_at)}
              </Text>
            </View>
            <View style={{ width: 24 }} />
          </View>

          {/* Hero Distance */}
          <View style={styles.heroSection}>
            <View style={styles.heroDistanceRow}>
              <Text style={styles.heroDistance}>{metersToKm(detail.distance_meters)}</Text>
              <Text style={styles.heroUnit}>km</Text>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGridWrapper}>
            <GlassCard>
              <View style={styles.statsGridInner}>
                <View style={styles.statRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{formatDuration(detail.duration_seconds)}</Text>
                    <Text style={styles.statLabel}>{t('running.metrics.time')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{formatPace(detail.avg_pace_seconds_per_km)}</Text>
                    <Text style={styles.statLabel}>{t('running.metrics.avgPace')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{detail.calories ?? '--'}</Text>
                    <Text style={styles.statLabel}>{t('running.metrics.kcal')}</Text>
                  </View>
                </View>
                <View style={styles.statRowDivider} />
                <View style={styles.statRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{formatPace(detail.best_pace_seconds_per_km)}</Text>
                    <Text style={styles.statLabel}>{t('mypage.bestPace')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>
                      {(detail.elevation_gain_meters ?? 0) > 0 ? `+${Math.round(detail.elevation_gain_meters)}` : '--'}
                    </Text>
                    <Text style={styles.statLabel}>{t('running.metrics.elevation')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>
                      {(detail.elevation_loss_meters ?? 0) > 0 ? `-${Math.round(detail.elevation_loss_meters)}` : '--'}
                    </Text>
                    <Text style={styles.statLabel}>{t('running.result.elevationLoss')}</Text>
                  </View>
                </View>
              </View>
            </GlassCard>
          </View>

          {/* Course completion info */}
          {detail.course_completion && (
            <View style={styles.courseCompletionCard}>
              <View style={styles.courseCompletionRow}>
                <View style={styles.courseCompletionItem}>
                  <Ionicons
                    name={detail.course_completion.is_completed ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={detail.course_completion.is_completed ? colors.success : colors.error}
                  />
                  <Text style={styles.courseCompletionLabel}>
                    {detail.course_completion.is_completed ? t('running.result.courseCompleted') : t('running.result.courseNotCompleted')}
                  </Text>
                </View>
                <Text style={styles.courseCompletionValue}>
                  {Math.round(detail.course_completion.route_match_percent)}%
                </Text>
              </View>
              {(detail.course_completion.ranking_at_time ?? 0) > 0 && (
                <Text style={styles.courseRankText}>
                  #{detail.course_completion.ranking_at_time}
                </Text>
              )}
            </View>
          )}

          {/* Route Map — static image by default, interactive on tap */}
          {routePoints.length >= 2 && (
            <View style={styles.mapContainer}>
              {showInteractiveMap ? (
                <RouteMapView
                  ref={mapRef}
                  routePoints={routePoints}
                  splitMarkers={splitMapMarkers.length > 0 ? splitMapMarkers : undefined}
                  interactive={false}
                  style={styles.mapPreview}
                />
              ) : staticMapUrl ? (
                <Image
                  source={{ uri: staticMapUrl }}
                  style={styles.mapPreview}
                  resizeMode="cover"
                />
              ) : null}
            </View>
          )}

          {/* Route Correction for existing course */}
          {detail.course && routePoints.length >= 2 && (
            <TouchableOpacity
              style={styles.routeCorrectBtn}
              activeOpacity={0.7}
              onPress={() => {
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'CourseTab',
                    params: {
                      screen: 'CourseRouteCorrect',
                      params: { courseId: detail.course!.id },
                    },
                  }),
                );
              }}
            >
              <Ionicons name="map-outline" size={18} color={colors.primary} />
              <Text style={styles.routeCorrectBtnText}>{t('course.detail.routeCorrection')}</Text>
            </TouchableOpacity>
          )}

          {/* Save as Course */}
          {!detail.course && detail.distance_meters >= 500 && routePoints.length >= 2 && (
            <TouchableOpacity
              style={styles.saveAsCourseBtn}
              activeOpacity={0.7}
              onPress={() => {
                const first = routePoints[0];
                const last = routePoints[routePoints.length - 1];
                const dlat = first.latitude - last.latitude;
                const dlng = first.longitude - last.longitude;
                const gapM = Math.sqrt(dlat * dlat + dlng * dlng) * 111_320;
                const isLoop = gapM < 200;

                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'CourseTab',
                    params: {
                      screen: 'CourseCreate',
                      params: {
                        runRecordId: detail.id,
                        routePoints,
                        distanceMeters: detail.distance_meters,
                        durationSeconds: detail.duration_seconds,
                        elevationGainMeters: detail.elevation_gain_meters,
                        isLoop,
                      },
                    },
                  }),
                );
              }}
            >
              <Ionicons name="map-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveAsCourseBtnText}>{t('running.result.registerCourse')}</Text>
            </TouchableOpacity>
          )}

          {/* Split Times */}
          {(detail.splits?.length ?? 0) > 0 && (
            <View style={styles.splitsSection}>
              <Text style={styles.sectionTitle}>{t('running.result.splits')}</Text>
              {(detail.splits?.length ?? 0) >= 2 && (
                <View style={styles.splitChartContainer}>
                  <SplitBarsChart
                    splits={(detail.splits ?? []).map(s => ({
                      split_number: s.split_number ?? 0,
                      pace_seconds_per_km: s.pace_seconds_per_km,
                      duration_seconds: s.duration_seconds,
                      distance_meters: s.distance_meters,
                    }))}
                  />
                </View>
              )}
              <View style={styles.splitsTable}>
                <View style={styles.splitHeader}>
                  <Text style={[styles.splitHeaderText, { textAlign: 'left' }]}>
                    {t('running.result.splitLap')}
                  </Text>
                  <Text style={styles.splitHeaderText}>
                    {t('running.result.splitPace')}
                  </Text>
                  <Text style={[styles.splitHeaderText, { textAlign: 'right' }]}>
                    {t('running.result.splitTime')}
                  </Text>
                </View>
                {(detail.splits ?? []).map((split: Split, index: number) => {
                  // Find fastest split for highlighting
                  const fastestPace = Math.min(
                    ...(detail.splits ?? []).map((s) => s.pace_seconds_per_km),
                  );
                  const isFastest = split.pace_seconds_per_km === fastestPace;

                  return (
                    <View
                      key={split.split_number}
                      style={[
                        styles.splitRow,
                        index % 2 === 0 && styles.splitRowAlt,
                      ]}
                    >
                      <View style={styles.splitLapCell}>
                        <Text style={styles.splitKm}>{split.split_number}</Text>
                        <Text style={styles.splitKmUnit}>km</Text>
                      </View>
                      <Text
                        style={[
                          styles.splitPace,
                          isFastest && { color: colors.primary, fontWeight: '900' },
                        ]}
                      >
                        {formatPace(split.pace_seconds_per_km)}
                      </Text>
                      <Text style={styles.splitTime}>
                        {formatDuration(split.duration_seconds)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Elevation */}
          {((detail.elevation_gain_meters ?? 0) > 0 || (detail.elevation_loss_meters ?? 0) > 0) && (
            <View style={styles.elevationCard}>
              <Text style={styles.sectionTitle}>{t('running.result.elevationChange')}</Text>
              <View style={styles.elevationRow}>
                <View style={styles.elevationItem}>
                  <Text style={styles.elevationArrowUp}>{'\u25B2'}</Text>
                  <View>
                    <Text style={styles.elevationValue}>
                      +{Math.round(detail.elevation_gain_meters)}m
                    </Text>
                    <Text style={styles.elevationLabel}>{t('running.result.elevationGain')}</Text>
                  </View>
                </View>
                <View style={styles.elevationDivider} />
                <View style={styles.elevationItem}>
                  <Text style={styles.elevationArrowDown}>{'\u25BC'}</Text>
                  <View>
                    <Text style={styles.elevationValue}>
                      -{Math.round(detail.elevation_loss_meters)}m
                    </Text>
                    <Text style={styles.elevationLabel}>{t('running.result.elevationLoss')}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    content: {
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
    },
    errorText: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      fontWeight: '500',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    headerDate: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },

    // Hero
    heroSection: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
    },
    heroDistanceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: SPACING.xs,
    },
    heroDistance: {
      fontSize: 56,
      fontWeight: '900',
      color: c.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
    },
    heroUnit: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Stats Grid
    statsGridWrapper: {
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
    },
    statsGridInner: {
      gap: 0,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.md,
      gap: SPACING.xs,
    },
    statValue: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.divider,
    },
    statRowDivider: {
      height: 1,
      backgroundColor: c.divider,
      marginHorizontal: SPACING.lg,
    },

    // Course Completion
    courseCompletionCard: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    courseCompletionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    courseCompletionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    courseCompletionLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    courseCompletionValue: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },
    courseRankText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    // Map
    mapContainer: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },
    mapPreview: {
      height: SCREEN_WIDTH - SPACING.xxl * 2,
      width: '100%',
      backgroundColor: '#1C1C1E',
    },



    // Route Correction
    routeCorrectBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      paddingVertical: SPACING.md,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    routeCorrectBtnText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.primary,
    },

    // Save as Course
    saveAsCourseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      paddingVertical: SPACING.md,
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.lg,
    },
    saveAsCourseBtnText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Splits
    splitsSection: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      gap: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textTertiary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    splitChartContainer: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    splitsTable: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    splitHeader: {
      flexDirection: 'row',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    splitHeaderText: {
      flex: 1,
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
      textAlign: 'center',
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
    },
    splitRowAlt: {
      backgroundColor: c.surface + '40',
    },
    splitLapCell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    splitKm: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    splitKmUnit: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    splitPace: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    splitTime: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },

    // Elevation
    elevationCard: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.xl,
      gap: SPACING.md,
    },
    elevationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    elevationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    elevationArrowUp: {
      fontSize: 16,
      color: c.success,
    },
    elevationArrowDown: {
      fontSize: 16,
      color: c.error,
    },
    elevationValue: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    elevationLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    elevationDivider: {
      width: 1,
      height: 32,
      backgroundColor: c.divider,
    },
  });
