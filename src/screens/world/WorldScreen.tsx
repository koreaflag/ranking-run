import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseStore } from '../../stores/courseStore';
import { courseService } from '../../services/courseService';
import RouteMapView from '../../components/map/RouteMapView';
import type { RouteMapViewHandle, CourseMarkerData } from '../../components/map/RouteMapView';
import type { Region } from 'react-native-maps';
import type { WorldStackParamList } from '../../types/navigation';
import type { GeoJSONLineString } from '../../types/api';

import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { formatDistance } from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import api from '../../services/api';

type WorldNav = NativeStackNavigationProp<WorldStackParamList, 'World'>;

// ============================================================
// Weather types & helpers
// ============================================================

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
  icon: string;
  aqi?: number;
  aqi_label?: string;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function getWeatherIconName(iconCode: string): IoniconsName {
  const base = iconCode.slice(0, 2);
  const isNight = iconCode.endsWith('n');

  switch (base) {
    case '01':
      return isNight ? 'moon' : 'sunny';
    case '02':
      return isNight ? 'cloudy-night' : 'partly-sunny';
    case '03':
    case '04':
      return 'cloudy';
    case '09':
    case '10':
      return 'rainy';
    case '11':
      return 'thunderstorm';
    case '13':
      return 'snow';
    case '50':
      return 'water';
    default:
      return 'cloud';
  }
}

function getAqiColor(aqi?: number): string {
    switch (aqi) {
        case 1: return COLORS.success;
        case 2: return COLORS.success;
        case 3: return COLORS.warning;
        case 4: return COLORS.accent;
        case 5: return COLORS.error;
        default: return COLORS.textTertiary;
    }
}

// ============================================================
// Constants
// ============================================================

const SEOUL_REGION: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// ============================================================
// Geo helpers
// ============================================================

type LatLng = { latitude: number; longitude: number };

/** Convert GeoJSON [lng, lat, alt] to { latitude, longitude }[] */
function geoJsonToLatLng(geo: GeoJSONLineString): LatLng[] {
  return geo.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

/** Calculate bearing (heading) from point A to point B in degrees */
function calcBearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Compute center + zoom from a set of points */
function computeCenter(points: LatLng[]): LatLng {
  let sumLat = 0;
  let sumLng = 0;
  for (const p of points) {
    sumLat += p.latitude;
    sumLng += p.longitude;
  }
  return { latitude: sumLat / points.length, longitude: sumLng / points.length };
}

// ============================================================
// WorldScreen
// ============================================================

export default function WorldScreen() {
  const navigation = useNavigation<WorldNav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { mapMarkers, fetchMapMarkers, nearbyCourses, fetchNearbyCourses, pendingFocusCourseId } = useCourseStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<RouteMapViewHandle>(null);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Selected marker state
  const [selectedMarker, setSelectedMarker] = useState<CourseMarkerData | null>(null);

  // 3D preview state
  const [previewRoute, setPreviewRoute] = useState<LatLng[]>([]);
  const [is3DMode, setIs3DMode] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const markerPressedRef = useRef(false);

  // Fetch initial data + cleanup
  useEffect(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = SEOUL_REGION;
    fetchMapMarkers(
      latitude - latitudeDelta / 2,
      longitude - longitudeDelta / 2,
      latitude + latitudeDelta / 2,
      longitude + longitudeDelta / 2,
    );
    fetchNearbyCourses(latitude, longitude);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [fetchMapMarkers, fetchNearbyCourses]);

  // Fetch weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const data = await api.get<WeatherData>(
          '/weather/current?lat=37.5665&lng=126.978',
        );
        setWeather(data);
      } catch {
        // In DEV mode, show mock weather data
        if (__DEV__) {
          setWeather({
            temp: 4,
            feels_like: 1,
            humidity: 45,
            wind_speed: 3.2,
            description: '맑음',
            icon: '01d',
            aqi: 2,
            aqi_label: '보통',
          });
        }
      }
    };
    fetchWeather();
  }, []);

  const handleRegionChange = useCallback(
    (region: Region) => {
      setUserRegion(region);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const swLat = region.latitude - region.latitudeDelta / 2;
        const swLng = region.longitude - region.longitudeDelta / 2;
        const neLat = region.latitude + region.latitudeDelta / 2;
        const neLng = region.longitude + region.longitudeDelta / 2;
        fetchMapMarkers(swLat, swLng, neLat, neLng);
      }, 500);
    },
    [fetchMapMarkers],
  );

  // Cancel any running route animation
  const cancelRouteAnimation = useCallback(() => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
  }, []);

  // Animate route drawing progressively
  const animateRouteDraw = useCallback((fullRoute: LatLng[]) => {
    cancelRouteAnimation();
    const total = fullRoute.length;
    if (total < 2) {
      setPreviewRoute(fullRoute);
      return;
    }

    let idx = 0;
    const step = Math.max(1, Math.ceil(total / 80)); // ~80 frames over ~1.3s
    setPreviewRoute([fullRoute[0]]);

    animTimerRef.current = setInterval(() => {
      idx = Math.min(idx + step, total);
      setPreviewRoute(fullRoute.slice(0, idx));
      if (idx >= total) {
        if (animTimerRef.current) clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
    }, 16);
  }, [cancelRouteAnimation]);

  // Handle pendingFocusCourseId from store (e.g. CourseDetail → "월드에서 보기")
  // We use a ref to avoid clearing the store value inside the effect (which would
  // trigger a re-render and cancel the setTimeout via cleanup).
  const focusHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocusCourseId || pendingFocusCourseId === focusHandledRef.current) return;
    focusHandledRef.current = pendingFocusCourseId;
    const targetId = pendingFocusCourseId;

    // Delay to ensure map is fully rendered after tab switch
    const focusOnCourse = async () => {
      try {
        const detail = await courseService.getCourseDetail(targetId);
        if (!detail.route_geometry?.coordinates?.length) return;

        const routePoints = geoJsonToLatLng(detail.route_geometry);
        const center = computeCenter(routePoints);

        setSelectedMarker({
          id: detail.id,
          title: detail.title,
          start_lat: center.latitude,
          start_lng: center.longitude,
          distance_meters: detail.distance_meters,
          elevation_gain_meters: detail.elevation_gain_meters,
          total_runs: 0,
          difficulty: null,
          avg_rating: null,
        } as CourseMarkerData);
        setIs3DMode(true);

        mapRef.current?.fitToCoordinates(routePoints, {
          top: 160, right: 40, bottom: 140, left: 40,
        }, true);

        setTimeout(() => {
          const heading = routePoints.length >= 2
            ? calcBearing(routePoints[0], routePoints[Math.floor(routePoints.length / 2)])
            : 0;
          mapRef.current?.animateCamera({ pitch: 55, heading }, 1000);
          animateRouteDraw(routePoints);
        }, 800);

        const delta = 0.04;
        fetchMapMarkers(
          center.latitude - delta, center.longitude - delta,
          center.latitude + delta, center.longitude + delta,
        );
      } catch {
        // Silent fail
      } finally {
        // Clear store value after work is done
        useCourseStore.getState().setPendingFocusCourseId(null);
      }
    };

    // Small delay for map readiness after tab switch
    setTimeout(focusOnCourse, 500);
  }, [pendingFocusCourseId, animateRouteDraw, fetchMapMarkers]);

  // Reset map back to 2D overview
  const resetTo2D = useCallback(() => {
    cancelRouteAnimation();
    setPreviewRoute([]);
    setIs3DMode(false);

    const target = userRegion ?? SEOUL_REGION;
    mapRef.current?.animateCamera(
      { center: target, pitch: 0, heading: 0, zoom: 13 },
      800,
    );
  }, [cancelRouteAnimation, userRegion]);

  const handleMarkerPress = useCallback(
    async (courseId: string) => {
      const marker = mapMarkers.find((m) => m.id === courseId) ?? null;
      if (!marker) return;

      // Guard: prevent map onPress from immediately clearing the selection
      markerPressedRef.current = true;
      setTimeout(() => { markerPressedRef.current = false; }, 300);

      // Cancel previous animation
      cancelRouteAnimation();
      setPreviewRoute([]);
      setSelectedMarker(marker);

      // Show HUD immediately
      setIs3DMode(true);

      // Fetch route geometry and fit entire course to screen
      try {
        const detail = await courseService.getCourseDetail(courseId);
        if (!detail.route_geometry?.coordinates?.length) {
          // No route — just zoom to marker
          mapRef.current?.animateCamera(
            { center: { latitude: marker.start_lat, longitude: marker.start_lng }, pitch: 50, heading: 0, zoom: 15.5 },
            1200,
          );
          return;
        }

        const routePoints = geoJsonToLatLng(detail.route_geometry);

        // Fit entire route to screen with padding for HUD overlays
        mapRef.current?.fitToCoordinates(routePoints, {
          top: 160, right: 40, bottom: 140, left: 40,
        }, true);

        // After fit, tilt to 3D and draw route (only change pitch/heading, keep zoom from fitToCoordinates)
        setTimeout(() => {
          const heading = routePoints.length >= 2
            ? calcBearing(routePoints[0], routePoints[Math.floor(routePoints.length / 2)])
            : 0;
          mapRef.current?.animateCamera(
            { pitch: 55, heading },
            1000,
          );
          animateRouteDraw(routePoints);
        }, 800);
      } catch {
        // Route fetch failed — zoom to marker
        mapRef.current?.animateCamera(
          { center: { latitude: marker.start_lat, longitude: marker.start_lng }, pitch: 50, heading: 0, zoom: 15.5 },
          1200,
        );
      }
    },
    [mapMarkers, cancelRouteAnimation, animateRouteDraw],
  );

  const handleMapPress = useCallback(() => {
    // Skip if a marker was just tapped (iOS fires both onMarkerPress + onPress)
    if (markerPressedRef.current) return;

    if (selectedMarker) {
      resetTo2D();
      setSelectedMarker(null);
    }
  }, [selectedMarker, resetTo2D]);

  const handleGoDetail = useCallback(() => {
    if (selectedMarker) {
      navigation.navigate('CourseDetail', { courseId: selectedMarker.id });
    }
  }, [navigation, selectedMarker]);

  const handleStartCourseRun = useCallback(() => {
    if (selectedMarker) {
      navigation.getParent()?.navigate('RunningTab', {
        screen: 'RunningMain',
        params: { courseId: selectedMarker.id },
      });
    }
  }, [navigation, selectedMarker]);

  const handleMyLocation = useCallback(() => {
    const center = myLocation ?? { latitude: SEOUL_REGION.latitude, longitude: SEOUL_REGION.longitude };
    mapRef.current?.animateToRegion(
      { ...center, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600,
    );
  }, [myLocation]);

  // Nearest course shorthand
  const nearest = nearbyCourses.length > 0 ? nearbyCourses[0] : null;

  // Difficulty label helper
  const getDifficultyLabel = (d?: string | null) => {
    switch (d) {
      case 'easy': return 'Lv.1';
      case 'medium': return 'Lv.2';
      case 'hard': return 'Lv.3';
      default: return '';
    }
  };
  const getDifficultyColor = (d?: string | null) => {
    switch (d) {
      case 'easy': return COLORS.success;
      case 'medium': return COLORS.warning;
      case 'hard': return COLORS.accent;
      default: return COLORS.primary;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} />

      {/* Full-screen map */}
      <RouteMapView
        ref={mapRef}
        markers={mapMarkers}
        previewPolyline={previewRoute}
        onMarkerPress={handleMarkerPress}
        onMapPress={handleMapPress}
        onRegionChange={handleRegionChange}
        onUserLocationChange={setMyLocation}
        showUserLocation
        interactive
        pitchEnabled={is3DMode}
        style={styles.map}
      />

      {/* Top overlay (hidden when HUD is shown) */}
      {!selectedMarker && (
        <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            {/* Weather widget */}
            {weather && (
              <View style={styles.weatherWidget}>
                <Ionicons
                  name={getWeatherIconName(weather.icon)}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={styles.weatherTemp}>{Math.round(weather.temp)}°</Text>
                <Text style={styles.weatherDesc}>{weather.description}</Text>
                <View style={styles.weatherDivider} />
                <Ionicons name="water" size={12} color={colors.textTertiary} />
                <Text style={styles.weatherDetail}>{weather.humidity}%</Text>
                {weather.aqi_label && (
                    <>
                        <View style={styles.weatherDivider} />
                        <Ionicons name="leaf" size={12} color={getAqiColor(weather.aqi)} />
                        <Text style={[styles.weatherDetail, { color: getAqiColor(weather.aqi) }]}>{weather.aqi_label}</Text>
                    </>
                )}
              </View>
            )}

            <View style={styles.markerCountBadge}>
              <Ionicons name="flag" size={12} color={COLORS.white} />
              <Text style={styles.markerCountText}>
                {mapMarkers.length}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* Right side: My Location button */}
      <View style={styles.rightControls} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={handleMyLocation}
          activeOpacity={0.7}
        >
          <Ionicons name="locate" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ===== HUD overlay when marker selected ===== */}
      {selectedMarker && (
        <>
          {/* Top HUD: course name + stats */}
          <SafeAreaView style={styles.hudTopOverlay} pointerEvents="box-none">
            <View style={styles.hudTop}>
              <TouchableOpacity
                style={styles.hudBackBtn}
                onPress={() => { resetTo2D(); setSelectedMarker(null); }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.white} />
              </TouchableOpacity>

              <View style={styles.hudTitleArea}>
                <View style={styles.hudTitleRow}>
                  {selectedMarker.difficulty && (
                    <View style={[styles.hudDiffBadge, { backgroundColor: getDifficultyColor(selectedMarker.difficulty) }]}>
                      <Text style={styles.hudDiffText}>
                        {getDifficultyLabel(selectedMarker.difficulty)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.hudTitle} numberOfLines={1}>
                    {selectedMarker.title}
                  </Text>
                </View>

                <View style={styles.hudStats}>
                  <View style={styles.hudStatItem}>
                    <Ionicons name="navigate" size={12} color={COLORS.primary} />
                    <Text style={styles.hudStatValue}>{formatDistance(selectedMarker.distance_meters)}</Text>
                  </View>
                  {(selectedMarker.elevation_gain_meters ?? 0) > 0 && (
                    <View style={styles.hudStatItem}>
                      <Ionicons name="trending-up" size={12} color={COLORS.success} />
                      <Text style={styles.hudStatValue}>{selectedMarker.elevation_gain_meters}m</Text>
                    </View>
                  )}
                  <View style={styles.hudStatItem}>
                    <Ionicons name="people" size={12} color={COLORS.secondary} />
                    <Text style={styles.hudStatValue}>{selectedMarker.total_runs}회</Text>
                  </View>
                  {selectedMarker.avg_rating != null && (
                    <View style={styles.hudStatItem}>
                      <Ionicons name="star" size={12} color={COLORS.warning} />
                      <Text style={styles.hudStatValue}>{selectedMarker.avg_rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </SafeAreaView>

          {/* Bottom HUD: action buttons */}
          <View style={styles.hudBottomOverlay} pointerEvents="box-none">
            <View style={styles.hudActions}>
              <TouchableOpacity
                style={styles.hudDetailBtn}
                onPress={handleGoDetail}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle" size={16} color={COLORS.black} />
                <Text style={styles.hudDetailText}>상세보기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.hudRunBtn}
                onPress={handleStartCourseRun}
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={16} color={COLORS.white} />
                <Text style={styles.hudRunText}>도전하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Bottom overlay (nearest course, shown when no marker selected) */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        {!selectedMarker && nearest ? (
          <TouchableOpacity
            style={styles.nearestCard}
            onPress={() => handleMarkerPress(nearest.id)}
            activeOpacity={0.8}
          >
            <View style={styles.nearestTopRow}>
              <View style={styles.nearestBadge}>
                <Text style={styles.nearestBadgeText}>가장 가까운 코스</Text>
              </View>
              {(nearest.active_runners ?? 0) > 0 && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>
                    {nearest.active_runners}명 도전중
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.nearestTitle} numberOfLines={1}>
              {nearest.title}
            </Text>
            <View style={styles.nearestStats}>
              <Text style={styles.nearestDistance}>
                {formatDistance(nearest.distance_meters)}
              </Text>
              <View style={styles.nearestDot} />
              <Text style={styles.nearestRuns}>
                {nearest.total_runs}회 도전
              </Text>
              {nearest.avg_rating != null && (
                <>
                  <View style={styles.nearestDot} />
                  <Ionicons name="star" size={11} color={COLORS.warning} />
                  <Text style={styles.nearestRating}>
                    {nearest.avg_rating.toFixed(1)}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
  },

  // -- Top overlay --
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  markerCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  markerCountText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
  },

  // -- Weather widget --
  weatherWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    ...SHADOWS.sm,
  },
  weatherTemp: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  weatherDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textSecondary,
  },
  weatherDivider: {
    width: 1,
    height: 12,
    backgroundColor: c.divider,
  },
  weatherDetail: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- HUD overlay (top: course info) --
  hudTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  hudTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  hudBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudTitleArea: {
    flex: 1,
    gap: 6,
  },
  hudTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  hudDiffBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.full,
  },
  hudDiffText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.black,
  },
  hudTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  hudStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  hudStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hudStatValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },

  // -- HUD overlay (bottom: actions) --
  hudBottomOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    zIndex: 50,
  },
  hudActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  hudDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    gap: SPACING.xs,
  },
  hudDetailText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.black,
  },
  hudRunBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    gap: SPACING.xs,
  },
  hudRunText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },

  // -- Right controls (my location) --
  rightControls: {
    position: 'absolute',
    bottom: 25,
    right: SPACING.xxl,
    gap: SPACING.sm,
  },
  myLocationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },

  // -- Bottom overlay --
  bottomOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
    alignItems: 'flex-end',
  },

  // Nearest course card
  nearestCard: {
    alignSelf: 'stretch',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  nearestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  nearestBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  liveText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.accent,
  },
  nearestTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
  },
  nearestStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  nearestDistance: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  nearestDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: c.textTertiary,
  },
  nearestRuns: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },
  nearestRating: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.warning,
    marginLeft: 2,
  },

});
