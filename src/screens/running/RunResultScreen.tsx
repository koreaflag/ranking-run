import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Dimensions,
  TouchableOpacity,
  NativeModules,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { useRunningStore } from '../../stores/runningStore';
import { runService } from '../../services/runService';
import { savePendingRunRecord, removePendingRunRecord, clearPendingChunksForSession, syncPendingData } from '../../services/pendingSyncService';
import { useTheme } from '../../hooks/useTheme';
import { useCompassHeading } from '../../hooks/useCompassHeading';
import { Ionicons } from '../../lib/icons';
import Button from '../../components/common/Button';
import RouteMapView from '../../components/map/RouteMapView';
import type { RouteMapViewHandle } from '../../components/map/RouteMapView';
import BlurredBackground from '../../components/common/BlurredBackground';
import GlassCard from '../../components/common/GlassCard';
import type { WorldStackParamList } from '../../types/navigation';
import type { RunCompleteResponse, Split, RawGPSPointAPI } from '../../types/api';
import type { ThemeColors } from '../../utils/constants';
import {
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type ResultRoute = RouteProp<WorldStackParamList, 'RunResult'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function getRankColor(rank: number, c: ThemeColors): string {
  if (rank === 1) return c.gold;
  if (rank === 2) return c.silver;
  if (rank === 3) return c.bronze;
  return c.textTertiary;
}

function getRankBgColor(rank: number, c: ThemeColors): string {
  if (rank === 1) return c.gold + '14';
  if (rank === 2) return c.surface;
  if (rank === 3) return c.bronze + '14';
  return c.surface;
}

export default function RunResultScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<ResultRoute>();
  const { sessionId, alreadyCompleted } = route.params;

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef<RouteMapViewHandle>(null);

  const {
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    calories,
    routePoints,
    splits,
    elevationGainMeters,
    elevationLossMeters,
    courseId,
    loopDetected,
    stopLocation,
    heartRate,
    cadence,
    checkpointPasses,
    chunkSequence,
    uploadedChunkSequences,
    deviationLog,
    filteredLocations,
    reset,
  } = useRunningStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<RunCompleteResponse | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);

  // Compass heading (native CLHeading only — no GPS bearing after run ends)
  const { heading: headingValue } = useCompassHeading();
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const handleUserLocationChange = useCallback(
    (coord: { latitude: number; longitude: number; heading?: number }) => {
      setMyLocation({ latitude: coord.latitude, longitude: coord.longitude });
    },
    [],
  );

  // Compute off-course deviation segments for result map visualization
  const OFF_COURSE_THRESHOLD = 30;
  const deviationSegments = useMemo(() => {
    if (!deviationLog.length || !courseId) return [];
    const segments: Array<[number, number]> = [];
    let start = -1;
    for (const { index, deviation } of deviationLog) {
      if (deviation > OFF_COURSE_THRESHOLD) {
        if (start < 0) start = index;
      } else if (start >= 0) {
        segments.push([start, index]);
        start = -1;
      }
    }
    if (start >= 0) segments.push([start, deviationLog[deviationLog.length - 1].index]);
    return segments;
  }, [deviationLog, courseId]);

  // Submit run: save locally first, then try server in background
  // Skip when the run was already completed (e.g., watch standalone runs)
  useEffect(() => {
    const submitRun = async () => {
      if (submitted || alreadyCompleted) {
        if (alreadyCompleted) setSubmitted(true);
        return;
      }
      setIsSubmitting(true);

      const pendingId = `local-run-${Date.now()}`;
      const storeState = useRunningStore.getState();
      const hasServerSession = sessionId && !sessionId.startsWith('local_');

      // Upload remaining GPS data as a final chunk before completing
      // This ensures ALL raw GPS data reaches the server (CLAUDE.md rule)
      let finalChunkSequence = chunkSequence;
      let finalUploadedSequences = [...uploadedChunkSequences];
      const remainingPoints = storeState.filteredLocations;

      if (hasServerSession && remainingPoints.length > 0) {
        const rawGPSPoints: RawGPSPointAPI[] = remainingPoints.map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
          alt: p.altitude,
          speed: p.speed,
          bearing: p.bearing,
          accuracy: 10,
          timestamp: Math.round(p.timestamp),
        }));

        try {
          await runService.uploadChunk(sessionId, {
            session_id: sessionId,
            sequence: finalChunkSequence,
            chunk_type: 'final',
            raw_gps_points: rawGPSPoints,
            chunk_summary: {
              distance_meters: Math.round(distanceMeters - storeState.lastChunkDistance),
              duration_seconds: Math.round((rawGPSPoints[rawGPSPoints.length - 1].timestamp - rawGPSPoints[0].timestamp) / 1000),
              avg_pace_seconds_per_km: Math.round(avgPaceSecondsPerKm),
              elevation_change_meters: Math.round(elevationGainMeters - elevationLossMeters),
              point_count: rawGPSPoints.length,
              start_timestamp: Math.round(rawGPSPoints[0].timestamp),
              end_timestamp: Math.round(rawGPSPoints[rawGPSPoints.length - 1].timestamp),
            },
            cumulative: {
              total_distance_meters: Math.round(distanceMeters),
              total_duration_seconds: Math.round(durationSeconds),
              avg_pace_seconds_per_km: Math.round(avgPaceSecondsPerKm),
            },
            completed_splits: splits,
            pause_intervals: storeState.pauseIntervals.map((pi) => ({
              paused_at: pi.paused_at,
              resumed_at: pi.resumed_at,
            })),
          });
          finalUploadedSequences.push(finalChunkSequence);
          finalChunkSequence++;
          console.log(`[RunResult] Final chunk uploaded (${rawGPSPoints.length} pts)`);
        } catch (e) {
          console.warn('[RunResult] Final chunk upload failed:', e);
          // Still increment — completeRun will reference total_chunks
          finalChunkSequence++;
        }
      }

      // RTS backward smoother: use future data to correct past GPS estimates
      let finalRouteCoords: [number, number, number][] = routePoints.length >= 2
        ? routePoints.map((p) => [p.longitude, p.latitude, 0])
        : [[127.0, 37.5, 0], [127.0001, 37.5001, 0]];
      let finalDistance = distanceMeters;

      if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule) {
        try {
          const smoothed = await NativeModules.GPSTrackerModule.getSmoothedRoute();
          if (smoothed?.route?.length >= 2) {
            finalRouteCoords = smoothed.route.map((p: any) => [p.longitude, p.latitude, p.altitude ?? 0]);
            finalDistance = smoothed.distance > 0 ? smoothed.distance : distanceMeters;
            console.log(`[RunResult] RTS smoothed: ${smoothed.route.length} pts, ${Math.round(finalDistance)}m`);
          }
        } catch (e) {
          console.warn('[RunResult] RTS smoothing failed, using original route:', e);
        }
      }

      const runPayload = {
        distance_meters: Math.round(finalDistance),
        duration_seconds: Math.round(durationSeconds),
        total_elapsed_seconds: Math.round(durationSeconds),
        avg_pace_seconds_per_km: Math.round(
          finalDistance > 0 ? (durationSeconds / (finalDistance / 1000)) : avgPaceSecondsPerKm,
        ),
        best_pace_seconds_per_km: Math.round(
          splits.length > 0
            ? Math.min(...splits.map((s) => s.pace_seconds_per_km))
            : avgPaceSecondsPerKm,
        ),
        avg_speed_ms: finalDistance / (durationSeconds || 1),
        max_speed_ms: 0,
        calories: Math.round(calories),
        finished_at: new Date().toISOString(),
        route_geometry: {
          type: 'LineString' as const,
          coordinates: finalRouteCoords as [number, number, number][],
        },
        elevation_gain_meters: Math.round(elevationGainMeters),
        elevation_loss_meters: Math.round(elevationLossMeters),
        elevation_profile: filteredLocations.map(loc => Math.round(loc.altitude)),
        splits,
        pause_intervals: storeState.pauseIntervals.map((pi) => ({
          paused_at: pi.paused_at,
          resumed_at: pi.resumed_at,
        })),
        filter_config: {
          kalman_q: 3.0,
          kalman_r_base: 10.0,
          outlier_speed_threshold: 12.0,
          outlier_accuracy_threshold: 50.0,
        },
        total_chunks: finalChunkSequence,
        uploaded_chunk_sequences: finalUploadedSequences,
        ...(checkpointPasses.length > 0 ? { checkpoint_passes: checkpointPasses } : {}),
      };

      // 1) Save locally first (instant — prevents data loss)
      try {
        await savePendingRunRecord({
          id: pendingId,
          sessionId,
          payload: runPayload,
          createdAt: new Date().toISOString(),
        });
        setSavedLocally(true);
      } catch (e) {
        console.warn('[RunResult] local save failed:', e);
      }

      // 2) Try server sync
      try {
        const response = await runService.completeRun(sessionId, runPayload);
        setResult(response);
        setSubmitted(true);
        // Server succeeded — remove local pending data
        await removePendingRunRecord(pendingId).catch(() => {});
        await clearPendingChunksForSession(sessionId).catch(() => {});
      } catch (error) {
        console.warn('[RunResult] completeRun failed:', sessionId, error);
        // Server failed — local data is safe, schedule background retry
        setSubmitted(true);
        setTimeout(() => {
          syncPendingData().catch(() => {});
        }, 5000);
      } finally {
        setIsSubmitting(false);
      }
    };

    submitRun();
  }, [
    sessionId,
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    calories,
    routePoints,
    splits,
    elevationGainMeters,
    elevationLossMeters,
    submitted,
    alreadyCompleted,
    chunkSequence,
    uploadedChunkSequences,
  ]);

  const resetToWorld = () => {
    reset();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'World' }],
      }),
    );
  };

  const handleGoHome = () => {
    resetToWorld();
    setTimeout(() => {
      (navigation as any).navigate('HomeTab');
    }, 0);
  };

  const handleRunAgain = () => {
    reset();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'World' }, { name: 'RunningMain' }],
      }),
    );
  };

  const MIN_COURSE_DISTANCE_M = 500;

  const handleRegisterCourse = () => {
    if (distanceMeters < MIN_COURSE_DISTANCE_M) {
      Alert.alert(t('common.notification'), t('running.result.minDistance'));
      return;
    }
    if (!result?.run_record_id) {
      Alert.alert(
        t('common.notification'),
        savedLocally
          ? t('running.result.localSavedNoUpload')
          : t('running.result.uploadNotDone'),
      );
      return;
    }
    const runRecordId = result.run_record_id;
    const params = {
      runRecordId,
      routePoints,
      distanceMeters,
      durationSeconds,
      elevationGainMeters,
      isLoop: loopDetected,
    };
    resetToWorld();
    setTimeout(() => {
      (navigation as any).navigate('CourseTab', { screen: 'CourseCreate', params });
    }, 0);
  };

  const handleWriteReview = () => {
    if (!courseId) return;
    resetToWorld();
    setTimeout(() => {
      (navigation as any).navigate('CourseTab', { screen: 'CourseDetail', params: { courseId, openReview: true } });
    }, 0);
  };

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimal header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>
            {courseId ? t('running.result.courseCompleted') : alreadyCompleted ? t('running.result.watchCompleted') : t('running.result.freeCompleted')}
          </Text>
        </View>

        {/* Hero Distance */}
        <View style={styles.heroSection}>
          <View style={styles.heroDistanceRow}>
            <Text style={styles.heroDistance}>{metersToKm(distanceMeters)}</Text>
            <Text style={styles.heroUnit}>km</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGridWrapper}>
          <GlassCard>
            <View style={styles.statsGridInner}>
              <View style={styles.statRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{formatDuration(durationSeconds)}</Text>
                  <Text style={styles.statLabel}>{t('running.metrics.time')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{formatPace(avgPaceSecondsPerKm)}</Text>
                  <Text style={styles.statLabel}>{t('running.metrics.avgPace')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{calories}</Text>
                  <Text style={styles.statLabel}>{t('running.metrics.kcal')}</Text>
                </View>
              </View>
              <View style={styles.statRowDivider} />
              <View style={styles.statRow}>
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, heartRate > 0 && { color: colors.error }]}>
                    {heartRate > 0 ? Math.round(heartRate) : '--'}
                  </Text>
                  <Text style={styles.statLabel}>{t('running.metrics.heartRate')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{cadence > 0 ? cadence : '--'}</Text>
                  <Text style={styles.statLabel}>{t('running.metrics.cadence')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>
                    {elevationGainMeters > 0 ? `+${Math.round(elevationGainMeters)}` : '--'}
                  </Text>
                  <Text style={styles.statLabel}>{t('running.metrics.elevation')}</Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Speed anomaly warning */}
        {result?.is_flagged && (
          <View style={styles.flagWarning}>
            <Ionicons name="warning" size={16} color={COLORS.white} />
            <View style={styles.flagTextArea}>
              <Text style={styles.flagTitle}>{t('running.result.speedAnomaly')}</Text>
              <Text style={styles.flagDesc}>
                {result.flag_reason ?? t('running.result.speedAnomalyDesc')}
              </Text>
            </View>
          </View>
        )}

        {/* Route Map with custom user location + heading */}
        <View style={styles.mapContainer}>
          <RouteMapView
            ref={mapRef}
            routePoints={routePoints.length >= 2 ? routePoints : undefined}
            showUserLocation
            interactive
            endPointOverride={stopLocation ?? undefined}
            customUserLocation={myLocation ?? undefined}
            customUserHeading={headingValue}
            onUserLocationChange={handleUserLocationChange}
            deviationSegments={deviationSegments.length > 0 ? deviationSegments : undefined}
            style={styles.mapPreview}
          />
          <TouchableOpacity
            style={styles.mapLocateBtn}
            onPress={() => {
              if (myLocation) {
                mapRef.current?.animateToRegion({
                  ...myLocation,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }, 600);
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="locate" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Ranking Card (if course run) */}
        {result?.ranking && (
          <View
            style={[
              styles.rankingCard,
              { backgroundColor: getRankBgColor(result.ranking.rank, colors) },
            ]}
          >
            <View style={styles.rankBadgeRow}>
              <View
                style={[
                  styles.rankCircle,
                  { backgroundColor: getRankColor(result.ranking.rank, colors) },
                ]}
              >
                <Text style={styles.rankCircleText}>
                  {result.ranking.rank}
                </Text>
              </View>
              <View style={styles.rankMeta}>
                <Text style={styles.rankPosition}>
                  {result.ranking.rank}
                  <Text style={styles.rankSuffix}>
                    {result.ranking.rank === 1
                      ? 'ST'
                      : result.ranking.rank === 2
                        ? 'ND'
                        : result.ranking.rank === 3
                          ? 'RD'
                          : 'TH'}
                  </Text>
                </Text>
                <Text style={styles.rankTotal}>
                  {t('running.result.rankingOf', { count: result.ranking.total_runners })}
                </Text>
              </View>
            </View>
            {result.ranking.is_personal_best && (
              <View style={styles.pbBadge}>
                <Text style={styles.pbText}>{t('running.result.pbBadge')}</Text>
              </View>
            )}
          </View>
        )}

        {/* Course Adherence Card */}
        {result?.route_match_percent != null && courseId && (
          <View style={styles.adherenceCard}>
            <Text style={styles.sectionTitle}>{t('running.result.courseAdherence')}</Text>
            <View style={styles.adherenceRow}>
              <View style={styles.adherenceItem}>
                <Text style={styles.adherenceValue}>{Math.round(result.route_match_percent)}%</Text>
                <Text style={styles.adherenceLabel}>{t('running.result.routeMatch')}</Text>
              </View>
              {result.max_deviation_meters != null && (
                <View style={styles.adherenceItem}>
                  <Text style={styles.adherenceValue}>{Math.round(result.max_deviation_meters)}m</Text>
                  <Text style={styles.adherenceLabel}>{t('running.result.maxDeviation')}</Text>
                </View>
              )}
            </View>
            {deviationSegments.length > 0 && (
              <View style={styles.deviationLegend}>
                <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
                <Text style={styles.legendText}>{t('running.result.offCourseSegments')}</Text>
              </View>
            )}
          </View>
        )}

        {/* Split Times */}
        {splits.length > 0 && (() => {
          const avgPace = splits.reduce((sum, s) => sum + s.pace_seconds_per_km, 0) / splits.length;
          return (
            <View style={styles.splitsSection}>
              <Text style={styles.sectionTitle}>{t('running.result.splits')}</Text>
              <View style={styles.splitsTable}>
                <View style={styles.splitHeader}>
                  <Text style={[styles.splitHeaderText, { textAlign: 'left' }]}>{t('running.result.splitLap')}</Text>
                  <Text style={styles.splitHeaderText}>{t('running.result.splitPace')}</Text>
                  <Text style={styles.splitHeaderText}>{t('running.result.splitDelta')}</Text>
                  <Text style={[styles.splitHeaderText, { textAlign: 'right' }]}>{t('running.result.splitTime')}</Text>
                </View>
                {splits.map((split: Split, index: number) => {
                  const delta = split.pace_seconds_per_km - avgPace;
                  const absDelta = Math.abs(delta);
                  const deltaSign = delta > 0 ? '+' : '-';
                  const deltaSec = Math.round(absDelta);
                  const deltaStr = deltaSec === 0 ? '-' : `${deltaSign}${deltaSec}s`;
                  const deltaColor = delta < -1 ? colors.success : delta > 3 ? colors.error : colors.textSecondary;
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
                      <Text style={styles.splitPace}>
                        {formatPace(split.pace_seconds_per_km)}
                      </Text>
                      <Text style={[styles.splitPace, { color: deltaColor }]}>
                        {deltaStr}
                      </Text>
                      <Text style={styles.splitTime}>
                        {formatDuration(split.duration_seconds)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* Elevation Card */}
        {(elevationGainMeters > 0 || elevationLossMeters > 0) && (
          <View style={styles.elevationCard}>
            <Text style={styles.sectionTitle}>{t('running.result.elevationChange')}</Text>
            <View style={styles.elevationRow}>
              <View style={styles.elevationItem}>
                <Text style={styles.elevationArrowUp}>{'\u25B2'}</Text>
                <View>
                  <Text style={styles.elevationValue}>
                    +{Math.round(elevationGainMeters)}m
                  </Text>
                  <Text style={styles.elevationLabel}>{t('running.result.elevationGain')}</Text>
                </View>
              </View>
              <View style={styles.elevationDivider} />
              <View style={styles.elevationItem}>
                <Text style={styles.elevationArrowDown}>{'\u25BC'}</Text>
                <View>
                  <Text style={styles.elevationValue}>
                    -{Math.round(elevationLossMeters)}m
                  </Text>
                  <Text style={styles.elevationLabel}>{t('running.result.elevationLoss')}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Server submission status */}
        {isSubmitting && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={styles.uploadingText}>{t('running.result.uploading')}</Text>
          </View>
        )}
        {!isSubmitting && submitted && !result && savedLocally && (
          <View style={styles.uploadingRow}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.uploadingText}>{t('running.result.offlineSaved')}</Text>
          </View>
        )}

        {/* Action Buttons — compact */}
        <View style={styles.actions}>
          <Button
            title={t('running.result.runAgain')}
            onPress={handleRunAgain}
            fullWidth
            size="md"
          />
          {courseId && (
            <Button
              title={t('running.result.writeReview')}
              variant="outline"
              onPress={handleWriteReview}
              fullWidth
              size="md"
            />
          )}
          {!courseId && (
            <Button
              title={distanceMeters < MIN_COURSE_DISTANCE_M
                ? t('running.result.registerCourseDisabled', { min: MIN_COURSE_DISTANCE_M })
                : isSubmitting
                  ? t('running.result.registerWaiting')
                  : t('running.result.registerCourse')}
              variant="outline"
              onPress={handleRegisterCourse}
              fullWidth
              size="md"
              disabled={distanceMeters < MIN_COURSE_DISTANCE_M}
            />
          )}
          <Button
            title={t('running.result.goHome')}
            variant="secondary"
            onPress={handleGoHome}
            fullWidth
            size="md"
          />
        </View>
      </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: SPACING.xl,
  },

  // -- Header --
  header: {
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xs,
  },
  headerLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },

  // -- Hero Distance --
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xxl,
  },
  heroDistanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroDistance: {
    fontSize: 56,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    lineHeight: 62,
  },
  heroUnit: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: c.textTertiary,
    marginLeft: SPACING.xs,
    letterSpacing: 1,
  },

  // -- Stats Grid --
  statsGridWrapper: {
    marginHorizontal: SPACING.xxl,
  },
  statsGridInner: {
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statRowDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginHorizontal: SPACING.lg,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: c.divider,
  },

  // -- Flag Warning --
  flagWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.error,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  flagTextArea: {
    flex: 1,
    gap: 2,
  },
  flagTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  flagDesc: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
  },

  // -- Route Map --
  mapContainer: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: c.surface,
  },
  mapPreview: {
    height: SCREEN_HEIGHT * 0.35,
    borderRadius: 0,
  },
  mapLocateBtn: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },

  // -- Ranking Card --
  rankingCard: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  rankBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rankCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
    color: c.white,
  },
  rankMeta: {
    gap: 2,
  },
  rankPosition: {
    fontSize: 32,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -1,
  },
  rankSuffix: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  rankTotal: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontWeight: '500',
  },
  pbBadge: {
    backgroundColor: c.accent,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  pbText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 1,
  },

  // -- Course Adherence --
  adherenceCard: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  adherenceRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  adherenceItem: {
    alignItems: 'center' as const,
  },
  adherenceValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800' as const,
    color: c.text,
  },
  adherenceLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    marginTop: 2,
  },
  deviationLegend: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  legendDot: {
    width: 10,
    height: 4,
    borderRadius: 2,
  },
  legendText: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
  },

  // -- Split Times --
  splitsSection: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.3,
  },
  splitsTable: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: c.card,
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  splitHeaderText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
    letterSpacing: 0.5,
    width: 80,
    textAlign: 'center',
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  splitRowAlt: {
    backgroundColor: c.surface,
  },
  splitLapCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: 80,
    gap: 3,
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
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
    width: 80,
    textAlign: 'center',
  },
  splitTime: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
    width: 80,
    textAlign: 'right',
  },

  // -- Elevation --
  elevationCard: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  elevationRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
  },
  elevationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  elevationArrowUp: {
    fontSize: FONT_SIZES.md,
    color: c.success,
  },
  elevationArrowDown: {
    fontSize: FONT_SIZES.md,
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

  // -- Uploading --
  uploadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  uploadingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- Actions --
  actions: {
    gap: SPACING.sm,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
  },
});
