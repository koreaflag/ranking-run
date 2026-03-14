import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Mapbox, { UserTrackingMode } from '@rnmapbox/maps';
import { Ionicons } from '../../lib/icons';
import { COLORS, DIFFICULTY_COLORS, type DifficultyLevel } from '../../utils/constants';
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

// ---- Checkpoint data ----

export interface CheckpointMarkerData {
  id: number;
  order: number;
  lat: number;
  lng: number;
  passed?: boolean;
  isNext?: boolean;
}

// ---- Component props ----

interface RouteMapViewProps {
  routePoints?: Array<{ latitude: number; longitude: number }>;
  markers?: CourseMarkerData[];
  eventMarkers?: EventMarkerData[];
  friendMarkers?: FriendMarkerData[];
  checkpoints?: CheckpointMarkerData[];
  previewPolyline?: Array<{ latitude: number; longitude: number }>;
  onMarkerPress?: (courseId: string) => void;
  onEventMarkerPress?: (eventId: string) => void;
  onRegionChange?: (region: Region) => void;
  onMapPress?: () => void;
  /** Called when user manually pans/zooms the map (user gesture, not programmatic) */
  onUserMapInteraction?: () => void;
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
  /** Camera padding when following user — shifts center to account for overlapping UI */
  followPadding?: { paddingTop?: number; paddingBottom?: number; paddingLeft?: number; paddingRight?: number };
  /** Zoom level to use when followsUserLocation is true */
  followZoomLevel?: number;
  /** Camera follow mode: 'normal' (default), 'compass' (heading-locked), 'course' (GPS bearing, nav-style) */
  followUserMode?: 'normal' | 'compass' | 'course';
  /** Camera pitch angle in degrees (e.g. 45 for tilted 3D view) */
  followPitch?: number;
  /** Off-course deviation segments to render in red: [startIdx, endIdx] pairs */
  deviationSegments?: Array<[number, number]>;
  /** Signal gap segments to render as dashed gray: [startIdx, endIdx] pairs */
  signalGapSegments?: Array<[number, number]>;
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
  /** Toggle follow off→on to force Camera re-engage follow mode (centers on user) */
  recenterOnUser: () => void;
}

// ---- Helpers ----

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
  checkpoints,
  previewPolyline,
  onMarkerPress,
  onEventMarkerPress,
  onRegionChange,
  onMapPress,
  onUserMapInteraction,
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
  followPadding,
  followZoomLevel,
  followUserMode: followUserModeProp,
  followPitch: followPitchProp,
  deviationSegments,
  signalGapSegments,
}, ref) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';
  const mapBearingRef = useRef(0);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  // ---------- Internal follow state ----------
  // Mapbox Camera silently blocks ALL setCamera/fitBounds calls when
  // followUserLocation=true. We manage follow internally so imperative
  // camera methods can disable it before animating.
  const [internalFollow, setInternalFollow] = useState(followsUserLocation);

  // When customUserLocation is provided, we center the camera on IT instead
  // of using Mapbox's native followUserLocation (which tracks raw GPS and
  // can diverge from the Kalman-filtered orange dot).
  const useCustomFollow = internalFollow && customUserLocation != null;

  // Sync external prop → internal state
  useEffect(() => {
    setInternalFollow(followsUserLocation);
  }, [followsUserLocation]);

  // Queue: animations waiting for follow=false to take effect
  const pendingAnimRef = useRef<(() => void) | null>(null);

  // After internalFollow becomes false, run pending animation
  useEffect(() => {
    if (!internalFollow && pendingAnimRef.current) {
      const fn = pendingAnimRef.current;
      pendingAnimRef.current = null;
      // requestAnimationFrame ensures Camera has committed follow=false to native
      requestAnimationFrame(() => fn());
    }
  }, [internalFollow]);

  /** Disable follow (if needed) then run the animation. */
  const runCameraAction = useCallback((action: () => void) => {
    if (internalFollow) {
      pendingAnimRef.current = action;
      setInternalFollow(false);
    } else {
      action();
    }
  }, [internalFollow]);

  // Determine mode
  const isRouteMode = routePoints.length > 0;
  const isMarkersMode = !isRouteMode && markers != null;
  const isInteractive = interactive ?? (isMarkersMode ? true : false);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    animateToRegion: (region: Region, duration = 500) => {
      if (!isFinite(region.longitude) || !isFinite(region.latitude)) return;
      runCameraAction(() => {
        cameraRef.current?.setCamera({
          centerCoordinate: [region.longitude, region.latitude],
          zoomLevel: deltaToZoom(region.latitudeDelta),
          animationDuration: duration,
          animationMode: 'easeTo',
        });
      });
    },
    animateCamera: (camera: Camera, duration = 1500) => {
      runCameraAction(() => {
        const config: any = { animationDuration: duration, animationMode: 'flyTo' };
        if (camera.center) {
          config.centerCoordinate = [camera.center.longitude, camera.center.latitude];
        }
        if (camera.pitch != null) config.pitch = camera.pitch;
        if (camera.heading != null) config.heading = camera.heading;
        if (camera.zoom != null) config.zoomLevel = camera.zoom;
        cameraRef.current?.setCamera(config);
      });
    },
    fitToCoordinates: (
      coords: Array<{ latitude: number; longitude: number }>,
      edgePadding = EDGE_PADDING,
      animated = true,
    ) => {
      if (coords.length === 0) return;
      runCameraAction(() => {
        const { ne, sw } = computeBounds(coords);
        cameraRef.current?.fitBounds(
          ne,
          sw,
          [edgePadding.top, edgePadding.right, edgePadding.bottom, edgePadding.left],
          animated ? 500 : 0,
        );
      });
    },
    recenterOnUser: () => {
      // Toggle follow off→on to force Camera re-engage follow mode
      setInternalFollow(false);
      requestAnimationFrame(() => setInternalFollow(true));
    },
  }), [runCameraAction]);

  // Initial camera config (skip route bounds when following user — Camera centers on user automatically)
  const cameraDefaults = useMemo(() => {
    if (isRouteMode && routePoints.length >= 2 && !followsUserLocation) {
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

  // Fit map to route bounds after map loads (skip when following user — Camera handles centering)
  const handleDidFinishLoadingMap = useCallback(() => {
    if (isRouteMode && routePoints.length >= 2 && !followsUserLocation) {
      // Immediate fit + delayed retry to ensure bounds are applied
      const { ne, sw } = computeBounds(routePoints);
      cameraRef.current?.fitBounds(ne, sw, [40, 40, 40, 40], 0);
      setTimeout(() => {
        cameraRef.current?.fitBounds(ne, sw, [40, 40, 40, 40], 0);
      }, 500);
    }
  }, [isRouteMode, routePoints, followsUserLocation]);

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

  // Custom follow: center camera on customUserLocation (Kalman-filtered)
  // instead of relying on Mapbox's native follow which tracks raw GPS.
  // Also rotates the map to face the user's heading direction.
  useEffect(() => {
    if (useCustomFollow && customUserLocation) {
      // Offset center slightly south so the user dot appears in the upper 40% of the map,
      // giving more visibility to the route ahead.
      const zoomLevel = followZoomLevel ?? 16;
      const offsetLat = 0.0004; // ~40m south offset at zoom 16
      const headingToUse = customUserHeading ?? 0;
      cameraRef.current?.setCamera({
        centerCoordinate: [customUserLocation.longitude, customUserLocation.latitude - offsetLat],
        zoomLevel,
        heading: headingToUse,
        pitch: followPitchProp ?? 0,
        animationDuration: 150,
        animationMode: 'easeTo',
      });
    }
  }, [useCustomFollow, customUserLocation?.latitude, customUserLocation?.longitude, followZoomLevel, customUserHeading, followPitchProp]);

  // Region change callback
  const handleRegionDidChange = useCallback(
    (feature: any) => {
      // Track map bearing for heading cone compensation
      const bearing = feature?.properties?.heading;
      if (bearing != null) mapBearingRef.current = bearing;

      // Track zoom level for conditional marker rendering
      const zoom = feature?.properties?.zoomLevel;
      if (zoom != null) setCurrentZoom(zoom);

      // Detect user-initiated map gesture (pan/zoom/rotate)
      const isUserInteraction = feature?.properties?.isUserInteraction;
      if (isUserInteraction) {
        // Disengage custom follow when user pans/zooms
        if (useCustomFollow) setInternalFollow(false);
        if (onUserMapInteraction) onUserMapInteraction();
      }

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
    [onRegionChange, onUserMapInteraction, useCustomFollow],
  );

  // User location update
  const handleUserLocationUpdate = useCallback(
    (location: any) => {
      if (!onUserLocationChange) return;
      const coords = location?.coords;
      if (!coords || !isFinite(coords.latitude) || !isFinite(coords.longitude)) return;
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

  // Detect round-trip: start ≈ end (within ~50m)
  const isRoundTrip = useMemo(() => {
    if (!startPoint || !endPoint) return false;
    const dlat = startPoint.latitude - endPoint.latitude;
    const dlng = startPoint.longitude - endPoint.longitude;
    return Math.sqrt(dlat * dlat + dlng * dlng) < 0.0005; // ~50m
  }, [startPoint, endPoint]);

  // Route GeoJSON
  const routeGeoJSON = useMemo(() => {
    if (!isRouteMode || routePoints.length < 2) return null;
    return toLineGeoJSON(routePoints);
  }, [isRouteMode, routePoints]);

  // Deviation overlay GeoJSON (red segments where runner went off-course)
  const deviationGeoJSON = useMemo<GeoJSON.Feature<GeoJSON.MultiLineString> | null>(() => {
    if (!deviationSegments || deviationSegments.length === 0 || routePoints.length < 2) return null;
    const lines: number[][][] = [];
    for (const [start, end] of deviationSegments) {
      const s = Math.max(0, start);
      const e = Math.min(routePoints.length - 1, end);
      if (e - s < 1) continue;
      const coords = routePoints.slice(s, e + 1).map(p => [p.longitude, p.latitude]);
      if (coords.length >= 2) lines.push(coords);
    }
    if (lines.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: lines },
    };
  }, [deviationSegments, routePoints]);

  // Signal gap overlay GeoJSON (dashed gray segments where GPS signal was lost)
  const signalGapGeoJSON = useMemo<GeoJSON.Feature<GeoJSON.MultiLineString> | null>(() => {
    if (!signalGapSegments || signalGapSegments.length === 0 || routePoints.length < 2) return null;
    const lines: number[][][] = [];
    for (const [start, end] of signalGapSegments) {
      const s = Math.max(0, start);
      const e = Math.min(routePoints.length - 1, end);
      if (e - s < 1) continue;
      const segment = routePoints.slice(s, e + 1).map(p => [p.longitude, p.latitude]);
      lines.push(segment);
    }
    if (lines.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: lines },
    };
  }, [signalGapSegments, routePoints]);

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
        rotateEnabled={!!pitchEnabledProp || followUserModeProp === 'course'}
        pitchEnabled={!!pitchEnabledProp || followPitchProp != null}
        onPress={onMapPress ? () => onMapPress() : undefined}
        onDidFinishLoadingMap={handleDidFinishLoadingMap}
        onRegionDidChange={isMarkersMode || useCustomFollow ? handleRegionDidChange : undefined}
        style={styles.map}
      >
        {/* Camera */}
        <Mapbox.Camera
          ref={cameraRef}
          key={followPadding ? `pad-${followPadding.paddingBottom ?? 0}` : 'default'}
          defaultSettings={cameraDefaults}
          followUserLocation={internalFollow && !useCustomFollow}
          followUserMode={internalFollow && !useCustomFollow
            ? (followUserModeProp === 'course'
              ? UserTrackingMode.FollowWithCourse
              : followUserModeProp === 'compass'
                ? UserTrackingMode.FollowWithHeading
                : UserTrackingMode.Follow)
            : undefined}
          followZoomLevel={internalFollow && !useCustomFollow ? (followZoomLevel ?? 15) : undefined}
          followPitch={internalFollow && followPitchProp != null ? followPitchProp : undefined}
          followPadding={followPadding}
          padding={followPadding ? {
            paddingTop: followPadding.paddingTop ?? 0,
            paddingBottom: followPadding.paddingBottom ?? 0,
            paddingLeft: followPadding.paddingLeft ?? 0,
            paddingRight: followPadding.paddingRight ?? 0,
          } : undefined}
          animationMode="flyTo"
          animationDuration={0}
        />

        {/* ---- Route display mode ---- */}
        {routeGeoJSON && (
          <Mapbox.ShapeSource id="route-source" shape={routeGeoJSON}>
            <Mapbox.LineLayer
              id="route-line"
              style={{
                lineColor: '#FFC800',
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        )}
        {deviationGeoJSON && (
          <Mapbox.ShapeSource id="deviation-source" shape={deviationGeoJSON}>
            <Mapbox.LineLayer
              id="deviation-line"
              aboveLayerID="route-line"
              style={{
                lineColor: '#FF3B30',
                lineWidth: 6,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}
        {signalGapGeoJSON && (
          <Mapbox.ShapeSource id="signalGapSource" shape={signalGapGeoJSON}>
            <Mapbox.LineLayer
              id="signalGapLine"
              aboveLayerID="route-line"
              style={{
                lineColor: '#8E8E93',
                lineWidth: 4,
                lineDasharray: [3, 2],
                lineOpacity: 0.7,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {startPoint && !hideRouteMarkers && isRoundTrip && (
          <Mapbox.MarkerView
            coordinate={[startPoint.longitude, startPoint.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.routePointWrapper}>
              <View style={[styles.routePointDot, styles.startDot]} />
              <Text style={[styles.routePointLabel, styles.startLabel]}>START / FINISH</Text>
            </View>
          </Mapbox.MarkerView>
        )}

        {startPoint && !hideRouteMarkers && !isRoundTrip && (
          <Mapbox.MarkerView
            coordinate={[startPoint.longitude, startPoint.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.routePointWrapper}>
              <View style={[styles.routePointDot, styles.startDot]} />
              <Text style={[styles.routePointLabel, styles.startLabel]}>START</Text>
            </View>
          </Mapbox.MarkerView>
        )}

        {endPoint && !hideRouteMarkers && !isRoundTrip && (
          <Mapbox.MarkerView
            coordinate={[endPoint.longitude, endPoint.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.routePointWrapper}>
              <View style={[styles.routePointDot, styles.finishDot]} />
              <Text style={[styles.routePointLabel, styles.finishLabel]}>FINISH</Text>
            </View>
          </Mapbox.MarkerView>
        )}

        {/* ---- Checkpoint markers (numbered circles along the route) ---- */}
        {checkpoints && checkpoints.length > 0 && checkpoints.map((cp) => {
            const bgColor = cp.passed ? '#34C759' : cp.isNext ? '#FFD700' : 'rgba(255,255,255,0.25)';
            const borderColor = cp.passed ? '#34C759' : cp.isNext ? '#FFD700' : 'rgba(255,255,255,0.6)';
            const textColor = cp.passed || cp.isNext ? '#000' : '#fff';
            return (
              <Mapbox.MarkerView
                key={`cp-${cp.id}`}
                coordinate={[cp.lng, cp.lat]}
                anchor={{ x: 0.5, y: 0.5 }}
                allowOverlap={true}
              >
                <View style={[styles.checkpointBadge, { backgroundColor: bgColor, borderColor }]}>
                  <Text style={[styles.checkpointText, { color: textColor }]}>{cp.order}</Text>
                </View>
              </Mapbox.MarkerView>
            );
          })}

        {/* ---- Open-world course markers (racing badge style) ---- */}
        {isMarkersMode && markers
          ?.filter((m) => m.start_lat != null && m.start_lng != null)
          .map((m) => {
            const diff = (m.difficulty ?? 'normal') as DifficultyLevel;
            const badgeColor = DIFFICULTY_COLORS[diff] ?? DIFFICULTY_COLORS.normal;
            const icon: keyof typeof Ionicons.glyphMap = 'flag';
            return (
              <Mapbox.MarkerView
                key={`course-${m.id}`}
                coordinate={[m.start_lng, m.start_lat]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={styles.courseBadgeWrapper}
                  onStartShouldSetResponder={() => {
                    onMarkerPress?.(m.id);
                    return true;
                  }}
                >
                  <View style={[styles.courseBadge, { backgroundColor: badgeColor }]}>
                    <Ionicons name={icon} size={14} color={COLORS.white} />
                  </View>
                </View>
              </Mapbox.MarkerView>
            );
          })}

        {/* User location — get coordinates only, NO visual puck */}
        {(showUserLocation || onUserLocationChange) && (
          <Mapbox.UserLocation
            visible={false}
            showsUserHeadingIndicator={false}
            onUpdate={handleUserLocationUpdate}
          />
        )}

        {/* Custom orange location dot + heading arrow via MarkerView (above all layers, always visible) */}
        {customUserLocation && isFinite(customUserLocation.longitude) && isFinite(customUserLocation.latitude) && (
          <Mapbox.MarkerView
            coordinate={[customUserLocation.longitude, customUserLocation.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap={true}
            allowOverlapWithPuck={true}
          >
            <View
              style={[
                styles.userLocationWrapper,
                customUserHeading != null
                  ? { transform: [{ rotate: `${((customUserHeading - mapBearingRef.current) % 360 + 360) % 360}deg` }] }
                  : undefined,
              ]}
            >
              {customUserHeading != null && (
                <View style={styles.headingChevron} />
              )}
              <View style={styles.userLocationInner} />
            </View>
          </Mapbox.MarkerView>
        )}

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


        {/* ---- Preview polyline (3D course preview) ---- */}
        {previewGeoJSON && (
          <Mapbox.ShapeSource id="preview-source" shape={previewGeoJSON}>
            <Mapbox.LineLayer
              id="preview-line"
              style={{
                lineColor: '#FFC800',
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
                lineEmissiveStrength: 1,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {previewPolyline && previewPolyline.length >= 2 && (() => {
          const first = previewPolyline[0];
          const last = previewPolyline[previewPolyline.length - 1];
          const dlat = first.latitude - last.latitude;
          const dlng = first.longitude - last.longitude;
          const isLoop = Math.sqrt(dlat * dlat + dlng * dlng) < 0.0005;
          return isLoop ? (
            <Mapbox.MarkerView coordinate={[first.longitude, first.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.routePointWrapper}>
                <View style={[styles.routePointDot, styles.startDot]} />
                <Text style={[styles.routePointLabel, styles.startLabel]}>START / FINISH</Text>
              </View>
            </Mapbox.MarkerView>
          ) : (
            <>
              <Mapbox.MarkerView coordinate={[first.longitude, first.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.routePointWrapper}>
                  <View style={[styles.routePointDot, styles.startDot]} />
                  <Text style={[styles.routePointLabel, styles.startLabel]}>START</Text>
                </View>
              </Mapbox.MarkerView>
              <Mapbox.MarkerView coordinate={[last.longitude, last.latitude]} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.routePointWrapper}>
                  <View style={[styles.routePointDot, styles.finishDot]} />
                  <Text style={[styles.routePointLabel, styles.finishLabel]}>FINISH</Text>
                </View>
              </Mapbox.MarkerView>
            </>
          );
        })()}

        {previewPolyline && previewPolyline.length === 1 && (
          <Mapbox.MarkerView coordinate={[previewPolyline[0].longitude, previewPolyline[0].latitude]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.routePointWrapper}>
              <View style={[styles.routePointDot, styles.startDot]} />
              <Text style={[styles.routePointLabel, styles.startLabel]}>START</Text>
            </View>
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

  // ---- Route START / FINISH markers ----
  routePointWrapper: {
    alignItems: 'center',
  },
  routePointDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  startDot: {
    backgroundColor: '#FFC800',
  },
  finishDot: {
    backgroundColor: '#FF3B30',
  },
  routePointLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  startLabel: {
    color: '#FFC800',
  },
  finishLabel: {
    color: '#FF3B30',
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


  // ---- User location marker + heading chevron ----
  userLocationWrapper: {
    alignItems: 'center',
    width: 30,
    height: 30,
    justifyContent: 'center',
  },
  headingChevron: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FF5F00',
    position: 'absolute',
    top: 0,
  },
  userLocationInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5F00',
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  userLocationDot: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- Checkpoint markers ----
  checkpointBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  checkpointText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // ---- Racing badge course markers ----
  courseBadgeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
});
