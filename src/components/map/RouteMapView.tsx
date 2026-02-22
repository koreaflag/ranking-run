import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import Mapbox, { UserTrackingMode } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, DIFFICULTY_COLORS, DIFFICULTY_LABELS, type DifficultyLevel } from '../../utils/constants';
import { formatDistance } from '../../utils/format';
import { useTheme } from '../../hooks/useTheme';
import { MAPBOX_DARK_STYLE, MAPBOX_LIGHT_STYLE } from '../../config/env';

// ============================================================
// RouteMapView — Mapbox GL implementation
//
// Two modes:
//   A) Route display  – shows a polyline of a running route
//   B) Open-world map – shows interactive course markers,
//      event markers, and friend markers
// ============================================================

// Backward-compatible Region type (replaces react-native-maps Region)
export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const SEOUL_CENTER: [number, number] = [126.978, 37.5665]; // [lng, lat]
const DEFAULT_ZOOM = 13;

const EDGE_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };

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
  routePoints?: Array<{ latitude: number; longitude: number }>;
  markers?: CourseMarkerData[];
  eventMarkers?: EventMarkerData[];
  friendMarkers?: FriendMarkerData[];
  previewPolyline?: Array<{ latitude: number; longitude: number }>;
  onMarkerPress?: (courseId: string) => void;
  onEventMarkerPress?: (eventId: string) => void;
  onRegionChange?: (region: Region) => void;
  onMapPress?: () => void;
  showUserLocation?: boolean;
  followsUserLocation?: boolean;
  onUserLocationChange?: (coordinate: { latitude: number; longitude: number; heading?: number }) => void;
  style?: object;
  interactive?: boolean;
  pitchEnabled?: boolean;
  lastKnownLocation?: { latitude: number; longitude: number };
  endPointOverride?: { latitude: number; longitude: number };
  customUserLocation?: { latitude: number; longitude: number };
  customUserHeading?: number;
  /** Hide the "출발"/"도착" label markers while still drawing the route polyline */
  hideRouteMarkers?: boolean;
  /** false = use basic flat Mapbox styles (2D), true/undefined = use custom 3D styles */
  use3DStyle?: boolean;
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

/** Convert lat/lng points to GeoJSON LineString */
function toLineGeoJSON(points: Array<{ latitude: number; longitude: number }>): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map(p => [p.longitude, p.latitude]),
    },
    properties: {},
  };
}

/** Compute bounds from points → [ne, sw] as [[lng,lat],[lng,lat]] */
function computeBounds(points: Array<{ latitude: number; longitude: number }>): {
  ne: [number, number];
  sw: [number, number];
} {
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

  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
  };
}

/** Compute zoom level from lat/lng delta */
function deltaToZoom(latDelta: number): number {
  return Math.max(1, Math.min(20, Math.log2(360 / Math.max(latDelta, 0.0001))));
}

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
  endPointOverride,
  customUserLocation,
  customUserHeading,
  hideRouteMarkers = false,
  use3DStyle = true,
}, ref) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';
  const mapBearingRef = useRef(0);

  // Determine mode
  const isRouteMode = routePoints.length > 0;
  const isMarkersMode = !isRouteMode && markers != null;
  const isInteractive = interactive ?? (isMarkersMode ? true : false);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    animateToRegion: (region: Region, duration = 500) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [region.longitude, region.latitude],
        zoomLevel: deltaToZoom(region.latitudeDelta),
        animationDuration: duration,
        animationMode: 'easeTo',
      });
    },
    animateCamera: (camera: Camera, duration = 1500) => {
      const config: any = { animationDuration: duration, animationMode: 'flyTo' };
      if (camera.center) {
        config.centerCoordinate = [camera.center.longitude, camera.center.latitude];
      }
      if (camera.pitch != null) config.pitch = camera.pitch;
      if (camera.heading != null) config.heading = camera.heading;
      if (camera.zoom != null) config.zoomLevel = camera.zoom;
      cameraRef.current?.setCamera(config);
    },
    fitToCoordinates: (
      coords: Array<{ latitude: number; longitude: number }>,
      edgePadding = EDGE_PADDING,
      animated = true,
    ) => {
      if (coords.length === 0) return;
      const { ne, sw } = computeBounds(coords);
      cameraRef.current?.fitBounds(
        ne,
        sw,
        [edgePadding.top, edgePadding.right, edgePadding.bottom, edgePadding.left],
        animated ? 500 : 0,
      );
    },
  }));

  // Initial camera config
  const cameraDefaults = useMemo(() => {
    if (isRouteMode && routePoints.length >= 2) {
      const { ne, sw } = computeBounds(routePoints);
      const latDelta = Math.max((ne[1] - sw[1]) * 2.5, 0.01);
      return {
        centerCoordinate: [(ne[0] + sw[0]) / 2, (ne[1] + sw[1]) / 2] as [number, number],
        zoomLevel: deltaToZoom(latDelta),
      };
    }
    return {
      centerCoordinate: SEOUL_CENTER as [number, number],
      zoomLevel: followsUserLocation ? 16 : DEFAULT_ZOOM,
    };
  }, []);

  // Fit map to route bounds after map loads
  const handleDidFinishLoadingMap = useCallback(() => {
    if (isRouteMode && routePoints.length >= 2) {
      // Immediate fit + delayed retry to ensure bounds are applied
      const { ne, sw } = computeBounds(routePoints);
      cameraRef.current?.fitBounds(ne, sw, [40, 40, 40, 40], 0);
      setTimeout(() => {
        cameraRef.current?.fitBounds(ne, sw, [40, 40, 40, 40], 0);
      }, 500);
    }
  }, [isRouteMode, routePoints]);

  // Re-fit when routePoints change
  useEffect(() => {
    if (isRouteMode && routePoints.length >= 2 && !followsUserLocation) {
      const timer = setTimeout(() => {
        const { ne, sw } = computeBounds(routePoints);
        cameraRef.current?.fitBounds(ne, sw, [40, 40, 40, 40], 500);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRouteMode, routePoints, followsUserLocation]);

  // Region change callback
  const handleRegionDidChange = useCallback(
    (feature: any) => {
      // Track map bearing for heading cone compensation
      const bearing = feature?.properties?.heading;
      if (bearing != null) mapBearingRef.current = bearing;

      if (!onRegionChange) return;
      const bounds = feature?.properties?.visibleBounds;
      if (!bounds || bounds.length < 2) return;
      const ne = bounds[0]; // [lng, lat]
      const sw = bounds[1];
      const region: Region = {
        latitude: (ne[1] + sw[1]) / 2,
        longitude: (ne[0] + sw[0]) / 2,
        latitudeDelta: Math.abs(ne[1] - sw[1]),
        longitudeDelta: Math.abs(ne[0] - sw[0]),
      };
      onRegionChange(region);
    },
    [onRegionChange],
  );

  // User location update
  const handleUserLocationUpdate = useCallback(
    (location: any) => {
      if (!onUserLocationChange) return;
      const coords = location?.coords;
      if (!coords) return;
      onUserLocationChange({
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading,
      });
    },
    [onUserLocationChange],
  );

  // Start / end points for route mode
  const startPoint = isRouteMode ? routePoints[0] : undefined;
  const endPoint =
    isRouteMode && routePoints.length >= 2
      ? (endPointOverride ?? routePoints[routePoints.length - 1])
      : undefined;

  // Route GeoJSON
  const routeGeoJSON = useMemo(() => {
    if (!isRouteMode || routePoints.length < 2) return null;
    return toLineGeoJSON(routePoints);
  }, [isRouteMode, routePoints]);

  // Preview polyline GeoJSON
  const previewGeoJSON = useMemo(() => {
    if (!previewPolyline || previewPolyline.length < 2) return null;
    return toLineGeoJSON(previewPolyline);
  }, [previewPolyline]);

  // Use globe projection for the world map mode (only in 3D style)
  const projection = isMarkersMode && use3DStyle ? 'globe' : 'mercator';

  // Map style: 3D = custom Mapbox styles, 2D = basic flat styles
  const mapStyleURL = use3DStyle
    ? (isDark ? MAPBOX_DARK_STYLE : MAPBOX_LIGHT_STYLE)
    : (isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11');

  return (
    <View style={[styles.container, style]}>
      <Mapbox.MapView
        styleURL={mapStyleURL}
        projection={projection}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled={isInteractive}
        zoomEnabled={isInteractive}
        rotateEnabled={!!pitchEnabledProp}
        pitchEnabled={!!pitchEnabledProp}
        onPress={onMapPress ? () => onMapPress() : undefined}
        onDidFinishLoadingMap={handleDidFinishLoadingMap}
        onRegionDidChange={isMarkersMode ? handleRegionDidChange : undefined}
        style={styles.map}
      >
        {/* Camera */}
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={cameraDefaults}
          followUserLocation={followsUserLocation}
          followUserMode={followsUserLocation ? UserTrackingMode.Follow : undefined}
          animationMode="flyTo"
          animationDuration={0}
        />

        {/* User location (default blue dot) */}
        {(showUserLocation || onUserLocationChange) && (
          <Mapbox.UserLocation
            visible={showUserLocation && !customUserLocation}
            animated
            onUpdate={handleUserLocationUpdate}
          />
        )}

        {/* ---- Route display mode ---- */}
        {routeGeoJSON && (
          <Mapbox.ShapeSource id="route-source" shape={routeGeoJSON}>
            <Mapbox.LineLayer
              id="route-line"
              style={{
                lineColor: COLORS.primary,
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {startPoint && !hideRouteMarkers && (
          <Mapbox.MarkerView
            coordinate={[startPoint.longitude, startPoint.latitude]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.labelMarkerWrapper}>
              <View style={[styles.labelMarkerPin, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.labelMarkerText}>출발</Text>
              </View>
              <View style={[styles.labelMarkerTail, { borderTopColor: COLORS.primary }]} />
            </View>
          </Mapbox.MarkerView>
        )}

        {endPoint && !hideRouteMarkers && (
          <Mapbox.MarkerView
            coordinate={[endPoint.longitude, endPoint.latitude]}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={[styles.labelMarkerWrapper, { marginLeft: 24 }]}>
              <View style={[styles.labelMarkerPin, { backgroundColor: COLORS.accent }]}>
                <Text style={[styles.labelMarkerText, { color: COLORS.black }]}>도착</Text>
              </View>
              <View style={[styles.labelMarkerTail, { borderTopColor: COLORS.accent }]} />
            </View>
          </Mapbox.MarkerView>
        )}

        {/* ---- Open-world course markers mode ---- */}
        {isMarkersMode &&
          markers
            .filter((m) => m.start_lat != null && m.start_lng != null)
            .map((marker) => (
            <Mapbox.MarkerView
              key={marker.id}
              coordinate={[marker.start_lng, marker.start_lat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View
                style={styles.markerWrapper}
                onStartShouldSetResponder={() => {
                  onMarkerPress?.(marker.id);
                  return true;
                }}
              >
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
            </Mapbox.MarkerView>
          ))}

        {/* ---- Event markers ---- */}
        {eventMarkers
          ?.filter((e) => e.center_lat != null && e.center_lng != null)
          .map((event) => (
          <Mapbox.MarkerView
            key={`event-${event.id}`}
            coordinate={[event.center_lng, event.center_lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={styles.eventMarkerWrapper}
              onStartShouldSetResponder={() => {
                onEventMarkerPress?.(event.id);
                return true;
              }}
            >
              <View style={[styles.eventMarkerOuter, { borderColor: event.badge_color || COLORS.accent }]}>
                <View style={[styles.eventMarkerInner, { backgroundColor: event.badge_color || COLORS.accent }]}>
                  <Ionicons name={(event.badge_icon || 'flash') as any} size={16} color={COLORS.white} />
                </View>
              </View>
            </View>
          </Mapbox.MarkerView>
        ))}

        {/* ---- Friend markers ---- */}
        {friendMarkers
          ?.filter((f) => f.latitude != null && f.longitude != null)
          .map((friend) => (
          <Mapbox.MarkerView
            key={`friend-${friend.user_id}`}
            coordinate={[friend.longitude, friend.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.friendMarkerWrapper}>
              <View style={styles.friendMarker}>
                <Text style={styles.friendInitial}>{friend.nickname?.[0] || '?'}</Text>
              </View>
              <View style={styles.friendPulse} />
            </View>
          </Mapbox.MarkerView>
        ))}

        {/* ---- Last known location marker ---- */}
        {lastKnownLocation && (
          <Mapbox.MarkerView
            coordinate={[lastKnownLocation.longitude, lastKnownLocation.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userLocationDot}>
              <View style={styles.userLocationInner} />
            </View>
          </Mapbox.MarkerView>
        )}

        {/* ---- Custom user location marker with heading ---- */}
        {customUserLocation && (
          <Mapbox.MarkerView
            coordinate={[customUserLocation.longitude, customUserLocation.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.customUserContainer}>
              {customUserHeading != null && (
                <View
                  style={[
                    styles.headingConeWrapper,
                    { transform: [{ rotate: `${((customUserHeading - mapBearingRef.current) % 360 + 360) % 360}deg` }] },
                  ]}
                >
                  <View style={styles.headingArrow} />
                </View>
              )}
              <View style={styles.customUserDot} />
            </View>
          </Mapbox.MarkerView>
        )}

        {/* ---- Preview polyline (3D course preview) ---- */}
        {previewGeoJSON && (
          <Mapbox.ShapeSource id="preview-source" shape={previewGeoJSON}>
            <Mapbox.LineLayer
              id="preview-line"
              style={{
                lineColor: COLORS.primary,
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {previewPolyline && previewPolyline.length >= 1 && (
          <Mapbox.MarkerView
            coordinate={[previewPolyline[0].longitude, previewPolyline[0].latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.previewStartDot} />
          </Mapbox.MarkerView>
        )}

        {previewPolyline && previewPolyline.length > 1 && (
          <Mapbox.MarkerView
            coordinate={[
              previewPolyline[previewPolyline.length - 1].longitude,
              previewPolyline[previewPolyline.length - 1].latitude,
            ]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.previewEndDot} />
          </Mapbox.MarkerView>
        )}
      </Mapbox.MapView>
    </View>
  );
});

export default RouteMapView;

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

  // ---- Event markers ----
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

  // ---- Friend markers ----
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

  // ---- Custom user location marker with heading ----
  customUserContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingConeWrapper: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
  },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.primary,
    opacity: 0.65,
    marginTop: 7,
  },
  customUserDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    borderWidth: 2.5,
    borderColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },

  // ---- User location fallback marker ----
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
