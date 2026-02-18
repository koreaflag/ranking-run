import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, DIFFICULTY_COLORS, DIFFICULTY_LABELS, type DifficultyLevel } from '../../utils/constants';
import { formatDistance } from '../../utils/format';
import { useTheme } from '../../hooks/useTheme';

// ============================================================
// RouteMapView
//
// Two modes:
//   A) Route display  – shows a polyline of a running route
//   B) Open-world map – shows interactive course markers,
//      event markers, and friend markers
// ============================================================

const SEOUL_REGION: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const EDGE_PADDING = { top: 50, right: 50, bottom: 50, left: 50 };

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#999999' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#333333' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#222222' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2e1a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#222222' }] },
];

// ---- Data interfaces ----

export interface CourseMarkerData {
  id: string;
  title: string;
  start_lat: number;
  start_lng: number;
  distance_meters: number;
  total_runs: number;
  difficulty?: DifficultyLevel | null;
  avg_rating?: number | null;
  active_runners?: number;
  is_new?: boolean;
  elevation_gain_meters?: number;
  creator_nickname?: string | null;
  user_rank?: number | null;
}

export interface EventMarkerData {
  id: string;
  title: string;
  event_type: string;
  badge_color: string;
  badge_icon: string;
  center_lat: number;
  center_lng: number;
  participant_count: number;
  ends_at: string;
}

export interface FriendMarkerData {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  latitude: number;
  longitude: number;
}

// ---- Component props ----

interface RouteMapViewProps {
  /** Route points for polyline display mode */
  routePoints?: Array<{ latitude: number; longitude: number }>;
  /** Course markers for open-world map mode */
  markers?: CourseMarkerData[];
  /** Event markers for open-world map mode */
  eventMarkers?: EventMarkerData[];
  /** Friend location markers for open-world map mode */
  friendMarkers?: FriendMarkerData[];
  /** Preview polyline for course preview (3D mode) */
  previewPolyline?: Array<{ latitude: number; longitude: number }>;
  /** Called when a course marker is tapped */
  onMarkerPress?: (courseId: string) => void;
  /** Called when an event marker is tapped */
  onEventMarkerPress?: (eventId: string) => void;
  /** Called when the visible region changes (for fetching markers in viewport) */
  onRegionChange?: (region: Region) => void;
  /** Called when the map background is tapped (no marker) */
  onMapPress?: () => void;
  /** Show the blue user-location dot */
  showUserLocation?: boolean;
  /** Auto-follow user location (centers map on user) */
  followsUserLocation?: boolean;
  /** Called when user location changes (from MapView) */
  onUserLocationChange?: (coordinate: { latitude: number; longitude: number }) => void;
  style?: object;
  /** Allow pan/zoom; defaults to true when markers are provided, false for route mode */
  interactive?: boolean;
  /** Enable pitch (3D tilt) on the map */
  pitchEnabled?: boolean;
  /** Show a static blue marker at this coordinate (for result screen when live location unavailable) */
  lastKnownLocation?: { latitude: number; longitude: number };
}

export interface Camera {
  center?: { latitude: number; longitude: number };
  pitch?: number;
  heading?: number;
  zoom?: number;
}

export interface RouteMapViewHandle {
  animateToRegion: (region: Region, duration?: number) => void;
  animateCamera: (camera: Camera, duration?: number) => void;
  fitToCoordinates: (
    coords: Array<{ latitude: number; longitude: number }>,
    edgePadding?: { top: number; right: number; bottom: number; left: number },
    animated?: boolean,
  ) => void;
}

// ---- Helpers ----

const getDifficultyColor = (difficulty?: string | null): string => {
  if (difficulty && difficulty in DIFFICULTY_COLORS) {
    return DIFFICULTY_COLORS[difficulty as DifficultyLevel];
  }
  return COLORS.primary;
};

const getDifficultyLabel = (difficulty?: string | null): string => {
  if (difficulty && difficulty in DIFFICULTY_LABELS) {
    return DIFFICULTY_LABELS[difficulty as DifficultyLevel];
  }
  return '';
};

// ---- Component ----

const RouteMapView = forwardRef<RouteMapViewHandle, RouteMapViewProps>(function RouteMapView({
  routePoints = [],
  markers,
  eventMarkers,
  friendMarkers,
  previewPolyline,
  onMarkerPress,
  onEventMarkerPress,
  onRegionChange,
  onMapPress,
  showUserLocation = false,
  followsUserLocation = false,
  onUserLocationChange,
  style,
  interactive,
  pitchEnabled: pitchEnabledProp,
  lastKnownLocation,
}, ref) {
  const mapRef = useRef<MapView>(null);
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';

  useImperativeHandle(ref, () => ({
    animateToRegion: (region: Region, duration = 500) => {
      mapRef.current?.animateToRegion(region, duration);
    },
    animateCamera: (camera: Camera, duration = 1500) => {
      mapRef.current?.animateCamera(camera, { duration });
    },
    fitToCoordinates: (
      coords: Array<{ latitude: number; longitude: number }>,
      edgePadding = EDGE_PADDING,
      animated = true,
    ) => {
      mapRef.current?.fitToCoordinates(coords, { edgePadding, animated });
    },
  }));

  // Determine mode
  const isRouteMode = routePoints.length > 0;
  const isMarkersMode = !isRouteMode && markers != null;

  // Resolve interactivity: explicit prop > markers-mode default true > route-mode default false
  const isInteractive = interactive ?? (isMarkersMode ? true : false);

  // For non-interactive route mode, use controlled `region` prop instead of
  // initialRegion+fitToCoordinates — the latter is unreliable inside ScrollView on iOS.
  // Skip when followsUserLocation is on — controlled region fights with follow mode.
  const routeRegion = isRouteMode && routePoints.length > 0 && !isInteractive && !followsUserLocation
    ? computeRegionFromPoints(routePoints)
    : undefined;

  // Fit map to route points once the map is ready (interactive route mode only)
  const handleMapReady = useCallback(() => {
    if (isRouteMode && routePoints.length >= 2 && isInteractive) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routePoints, {
          edgePadding: EDGE_PADDING,
          animated: false,
        });
      }, 300);
    }
  }, [isRouteMode, routePoints, isInteractive]);

  // Re-fit when routePoints change — only for interactive route mode
  // (non-interactive uses controlled `region` prop; fitToCoordinates conflicts with followsUserLocation)
  useEffect(() => {
    if (isRouteMode && routePoints.length >= 2 && isInteractive && !followsUserLocation) {
      const timer = setTimeout(() => {
        mapRef.current?.fitToCoordinates(routePoints, {
          edgePadding: EDGE_PADDING,
          animated: true,
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRouteMode, routePoints, isInteractive, followsUserLocation]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      onRegionChange?.(region);
    },
    [onRegionChange],
  );

  // Start / end points for route mode
  const startPoint = isRouteMode ? routePoints[0] : undefined;
  const endPoint =
    isRouteMode && routePoints.length >= 2
      ? routePoints[routePoints.length - 1]
      : undefined;

  // Compute initial region (used only when routeRegion is not set)
  // For follow mode (live running), use tight zoom (~200m view)
  const initialRegion = followsUserLocation
    ? { ...SEOUL_REGION, latitudeDelta: 0.003, longitudeDelta: 0.003 }
    : isRouteMode && routePoints.length > 0
      ? computeRegionFromPoints(routePoints)
      : SEOUL_REGION;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        region={routeRegion}
        initialRegion={routeRegion ? undefined : initialRegion}
        showsUserLocation={showUserLocation}
        followsUserLocation={followsUserLocation}
        showsMyLocationButton={false}
        showsCompass={isMarkersMode}
        showsScale={false}
        scrollEnabled={isInteractive}
        zoomEnabled={isInteractive}
        rotateEnabled={!!pitchEnabledProp}
        pitchEnabled={!!pitchEnabledProp}
        onMapReady={handleMapReady}
        onPress={onMapPress}
        onUserLocationChange={
          onUserLocationChange
            ? (e) => onUserLocationChange(e.nativeEvent.coordinate)
            : undefined
        }
        onRegionChangeComplete={
          isMarkersMode ? handleRegionChangeComplete : undefined
        }
        mapPadding={
          Platform.OS === 'android'
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : undefined
        }
      >
        {/* ---- Route display mode ---- */}
        {isRouteMode && (
          <Polyline
            coordinates={routePoints}
            strokeColor={COLORS.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {startPoint && (
          <Marker
            coordinate={startPoint}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={1}
          >
            <View style={styles.labelMarkerWrapper}>
              <View style={[styles.labelMarkerPin, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.labelMarkerText}>출발</Text>
              </View>
              <View style={[styles.labelMarkerTail, { borderTopColor: COLORS.primary }]} />
            </View>
          </Marker>
        )}

        {endPoint && (
          <Marker
            coordinate={endPoint}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={2}
          >
            <View style={[styles.labelMarkerWrapper, { marginLeft: 24 }]}>
              <View style={[styles.labelMarkerPin, { backgroundColor: COLORS.accent }]}>
                <Text style={[styles.labelMarkerText, { color: COLORS.black }]}>도착</Text>
              </View>
              <View style={[styles.labelMarkerTail, { borderTopColor: COLORS.accent }]} />
            </View>
          </Marker>
        )}

        {/* ---- Open-world course markers mode ---- */}
        {isMarkersMode &&
          markers
            .filter((m) => m.start_lat != null && m.start_lng != null)
            .map((marker) => (
            <Marker
              key={marker.id}
              coordinate={{
                latitude: marker.start_lat,
                longitude: marker.start_lng,
              }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              onPress={() => onMarkerPress?.(marker.id)}
            >
              <View style={styles.markerWrapper}>
                {/* Top badge */}
                {marker.user_rank === 1 ? (
                  <View style={styles.crownBadge}>
                    <Ionicons name="trophy" size={10} color={COLORS.gold} />
                  </View>
                ) : marker.is_new ? (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>N</Text>
                  </View>
                ) : null}
                {/* Pin body */}
                <View style={[styles.markerPin, { backgroundColor: getDifficultyColor(marker.difficulty) }]}>
                  <Ionicons name="footsteps" size={14} color={COLORS.white} />
                  {marker.active_runners != null && marker.active_runners > 0 && (
                    <View style={styles.runnerCountBadge}>
                      <Text style={styles.runnerCountText}>{marker.active_runners}</Text>
                    </View>
                  )}
                </View>
                {/* Pin tail */}
                <View style={[styles.markerTail, { borderTopColor: getDifficultyColor(marker.difficulty) }]} />
              </View>
            </Marker>
          ))}

        {/* ---- Event markers ---- */}
        {eventMarkers
          ?.filter((e) => e.center_lat != null && e.center_lng != null)
          .map((event) => (
          <Marker
            key={`event-${event.id}`}
            coordinate={{
              latitude: event.center_lat,
              longitude: event.center_lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onPress={() => onEventMarkerPress?.(event.id)}
          >
            <View style={styles.eventMarkerWrapper}>
              <View style={[styles.eventMarkerOuter, { borderColor: event.badge_color || COLORS.accent }]}>
                <View style={[styles.eventMarkerInner, { backgroundColor: event.badge_color || COLORS.accent }]}>
                  <Ionicons name={(event.badge_icon || 'flash') as any} size={16} color={COLORS.white} />
                </View>
              </View>
            </View>
          </Marker>
        ))}

        {/* ---- Friend markers ---- */}
        {friendMarkers
          ?.filter((f) => f.latitude != null && f.longitude != null)
          .map((friend) => (
          <Marker
            key={`friend-${friend.user_id}`}
            coordinate={{
              latitude: friend.latitude,
              longitude: friend.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.friendMarkerWrapper}>
              <View style={styles.friendMarker}>
                <Text style={styles.friendInitial}>{friend.nickname?.[0] || '?'}</Text>
              </View>
              <View style={styles.friendPulse} />
            </View>
          </Marker>
        ))}

        {/* ---- Last known location marker (fallback when showsUserLocation unavailable) ---- */}
        {lastKnownLocation && (
          <Marker
            coordinate={lastKnownLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.userLocationDot}>
              <View style={styles.userLocationInner} />
            </View>
          </Marker>
        )}

        {/* ---- Preview polyline (3D course preview) ---- */}
        {previewPolyline && previewPolyline.length >= 2 && (
          <>
            <Polyline
              coordinates={previewPolyline}
              strokeColor={COLORS.primary}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
            <Marker
              coordinate={previewPolyline[0]}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.previewStartDot} />
            </Marker>
            {previewPolyline.length > 1 && (
              <Marker
                coordinate={previewPolyline[previewPolyline.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.previewEndDot} />
              </Marker>
            )}
          </>
        )}
      </MapView>
    </View>
  );
});

export default RouteMapView;

// ============================================================
// Helpers
// ============================================================

function computeRegionFromPoints(
  points: Array<{ latitude: number; longitude: number }>,
): Region {
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  const latDelta = Math.max((maxLat - minLat) * 1.5, 0.005);
  const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.005);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
    minHeight: 200,
  },

  // ---- Route start / end label markers ----
  labelMarkerWrapper: {
    alignItems: 'center',
  },
  labelMarkerPin: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  labelMarkerText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  labelMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },

  // ---- Course marker (modern minimal pin) ----
  markerWrapper: {
    alignItems: 'center',
  },

  crownBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -3,
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },

  newBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -3,
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.white,
  },

  // Circular pin with shadow
  markerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },

  // Slim elegant tail
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },

  // Active runners count badge - smaller, cleaner
  runnerCountBadge: {
    position: 'absolute',
    top: -3,
    right: -5,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    zIndex: 3,
  },
  runnerCountText: {
    fontSize: 7,
    fontWeight: '900',
    color: COLORS.black,
  },

  // ---- Event markers (PaceOff: double ring pulse) ----
  eventMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  eventMarkerOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMarkerInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- Friend markers (PaceOff: live runner dot with pulse ring) ----
  friendMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  friendMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    borderWidth: 2.5,
    borderColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  friendPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    opacity: 0.4,
  },
  friendInitial: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.black,
  },

  // ---- Preview polyline start/end dots ----
  previewStartDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  previewEndDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accent,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },

  // ---- User location fallback marker (blue dot like iOS) ----
  userLocationDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#007AFF',
    borderWidth: 2.5,
    borderColor: COLORS.white,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
});
