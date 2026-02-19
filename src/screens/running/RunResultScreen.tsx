import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { useRunningStore } from '../../stores/runningStore';
import { runService } from '../../services/runService';
import { useTheme } from '../../hooks/useTheme';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import RouteMapView from '../../components/map/RouteMapView';
import BlurredBackground from '../../components/common/BlurredBackground';
import GlassCard from '../../components/common/GlassCard';
import type { RunningStackParamList } from '../../types/navigation';
import type { RunCompleteResponse, Split } from '../../types/api';
import type { ThemeColors } from '../../utils/constants';
import {
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

type ResultRoute = RouteProp<RunningStackParamList, 'RunResult'>;

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
  const navigation = useNavigation();
  const route = useRoute<ResultRoute>();
  const { sessionId } = route.params;

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    calories,
    routePoints,
    currentLocation,
    splits,
    elevationGainMeters,
    elevationLossMeters,
    courseId,
    loopDetected,
    stopLocation,
    reset,
  } = useRunningStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<RunCompleteResponse | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Submit run to server on mount
  useEffect(() => {
    const submitRun = async () => {
      if (submitted) return;
      setIsSubmitting(true);
      try {
        const response = await runService.completeRun(sessionId, {
          distance_meters: distanceMeters,
          duration_seconds: durationSeconds,
          total_elapsed_seconds: durationSeconds, // simplified for MVP
          avg_pace_seconds_per_km: avgPaceSecondsPerKm,
          best_pace_seconds_per_km:
            splits.length > 0
              ? Math.min(...splits.map((s) => s.pace_seconds_per_km))
              : avgPaceSecondsPerKm,
          avg_speed_ms: distanceMeters / (durationSeconds || 1),
          max_speed_ms: 0,
          calories,
          finished_at: new Date().toISOString(),
          route_geometry: {
            type: 'LineString',
            coordinates: routePoints.length >= 2
              ? routePoints.map((p) => [p.longitude, p.latitude, 0])
              : [[127.0, 37.5, 0], [127.0001, 37.5001, 0]],
          },
          elevation_gain_meters: elevationGainMeters,
          elevation_loss_meters: elevationLossMeters,
          elevation_profile: [],
          splits,
          pause_intervals: [],
          filter_config: {
            kalman_q: 3.0,
            kalman_r_base: 10.0,
            outlier_speed_threshold: 12.0,
            outlier_accuracy_threshold: 50.0,
          },
          total_chunks: 0,
          uploaded_chunk_sequences: [],
        });
        setResult(response);
        setSubmitted(true);
      } catch (error) {
        console.warn('[RunResult] completeRun failed:', sessionId, error);
        // Data is saved locally via chunks — user can still browse result
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
  ]);

  const resetRunningStack = () => {
    reset();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'RunningMain' }],
      }),
    );
  };

  const handleGoHome = () => {
    resetRunningStack();
    setTimeout(() => {
      navigation.getParent()?.navigate('HomeTab');
    }, 0);
  };

  const handleRunAgain = () => {
    resetRunningStack();
  };

  const MIN_COURSE_DISTANCE_M = 500;

  const handleRegisterCourse = () => {
    if (distanceMeters < MIN_COURSE_DISTANCE_M) {
      Alert.alert('알림', '코스 등록은 500m 이상 달려야 가능합니다.');
      return;
    }
    const runRecordId = result?.run_record_id ?? sessionId;
    const params = {
      runRecordId,
      routePoints,
      distanceMeters,
      durationSeconds,
      elevationGainMeters,
      isLoop: loopDetected,
    };
    resetRunningStack();
    setTimeout(() => {
      navigation.getParent()?.navigate('CourseTab', {
        screen: 'CourseCreate',
        params,
      });
    }, 0);
  };

  const handleWriteReview = () => {
    if (!courseId) return;
    resetRunningStack();
    setTimeout(() => {
      navigation.getParent()?.navigate('CourseTab', {
        screen: 'CourseDetail',
        params: { courseId, openReview: true },
      });
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
            {courseId ? '코스 러닝 완료' : '자유 러닝 완료'}
          </Text>
        </View>

        {/* Hero Distance -- the BIGGEST element */}
        <View style={styles.heroSection}>
          <View style={styles.heroDistanceRow}>
            <Text style={styles.heroDistance}>{metersToKm(distanceMeters)}</Text>
            <Text style={styles.heroUnit}>km</Text>
          </View>
        </View>

        {/* Stats Grid -- GlassCard */}
        <View style={styles.statsGridWrapper}>
          <GlassCard>
            <View style={styles.statsGridInner}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>
                  {formatDuration(durationSeconds)}
                </Text>
                <Text style={styles.statLabel}>시간</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statValue}>
                  {formatPace(avgPaceSecondsPerKm)}
                </Text>
                <Text style={styles.statLabel}>평균 페이스</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{calories}</Text>
                <Text style={styles.statLabel}>kcal</Text>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Route Map */}
        <View style={styles.mapContainer}>
          <RouteMapView
            routePoints={routePoints.length >= 2 ? routePoints : undefined}
            showUserLocation
            endPointOverride={stopLocation ?? undefined}
            lastKnownLocation={
              currentLocation
                ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
                : routePoints.length > 0
                  ? routePoints[routePoints.length - 1]
                  : undefined
            }
            style={styles.mapPreview}
          />
        </View>

        {/* Ranking Card (if course run) */}
        {result?.ranking && (
          <View
            style={[
              styles.rankingCard,
              { backgroundColor: getRankBgColor(result.ranking.rank, colors) },
            ]}
          >
            <Text style={styles.rankingLabel}>코스 순위</Text>
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
                  / {result.ranking.total_runners}명 중
                </Text>
              </View>
            </View>
            {result.ranking.is_personal_best && (
              <View style={styles.pbBadge}>
                <Text style={styles.pbText}>PB  개인 최고 기록</Text>
              </View>
            )}
          </View>
        )}

        {/* Split Times */}
        {splits.length > 0 && (
          <View style={styles.splitsSection}>
            <Text style={styles.sectionTitle}>구간 기록</Text>
            <View style={styles.splitsTable}>
              <View style={styles.splitHeader}>
                <Text style={[styles.splitHeaderText, { textAlign: 'left' }]}>구간</Text>
                <Text style={styles.splitHeaderText}>페이스</Text>
                <Text style={[styles.splitHeaderText, { textAlign: 'right' }]}>시간</Text>
              </View>
              {splits.map((split: Split, index: number) => (
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
                  <Text style={styles.splitTime}>
                    {formatDuration(split.duration_seconds)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Elevation Card */}
        {(elevationGainMeters > 0 || elevationLossMeters > 0) && (
          <View style={styles.elevationCard}>
            <Text style={styles.sectionTitle}>고도 변화</Text>
            <View style={styles.elevationRow}>
              <View style={styles.elevationItem}>
                <Text style={styles.elevationArrowUp}>{'\u25B2'}</Text>
                <View>
                  <Text style={styles.elevationValue}>
                    +{Math.round(elevationGainMeters)}m
                  </Text>
                  <Text style={styles.elevationLabel}>상승</Text>
                </View>
              </View>
              <View style={styles.elevationDivider} />
              <View style={styles.elevationItem}>
                <Text style={styles.elevationArrowDown}>{'\u25BC'}</Text>
                <View>
                  <Text style={styles.elevationValue}>
                    -{Math.round(elevationLossMeters)}m
                  </Text>
                  <Text style={styles.elevationLabel}>하강</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Server submission status */}
        {isSubmitting && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={styles.uploadingText}>기록 업로드 중...</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            title="다시 달리기"
            onPress={handleRunAgain}
            fullWidth
            size="lg"
          />
          {courseId && (
            <Button
              title="리뷰 남기기"
              variant="outline"
              onPress={handleWriteReview}
              fullWidth
              size="lg"
            />
          )}
          {!courseId && (
            <Button
              title={distanceMeters < MIN_COURSE_DISTANCE_M
                ? `코스 등록 (${MIN_COURSE_DISTANCE_M}m 이상 필요)`
                : '코스로 등록'}
              variant="outline"
              onPress={handleRegisterCourse}
              fullWidth
              size="lg"
              disabled={distanceMeters < MIN_COURSE_DISTANCE_M}
            />
          )}
          <Button
            title="홈으로"
            variant="secondary"
            onPress={handleGoHome}
            fullWidth
            size="lg"
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
    paddingBottom: SPACING.xxxl + SPACING.xl,
  },

  // -- Header: minimal, let stats speak --
  header: {
    paddingTop: SPACING.xxxl,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.sm,
  },
  headerLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },

  // -- Hero Distance: the BIGGEST element --
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
  },
  heroDistanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroDistance: {
    fontSize: 80,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -3,
    lineHeight: 88,
  },
  heroUnit: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '600',
    color: c.textTertiary,
    marginLeft: SPACING.sm,
    letterSpacing: 1,
  },

  // -- Stats Grid --
  statsGridWrapper: {
    marginHorizontal: SPACING.xxl,
  },
  statsGridInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
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
    height: 32,
    backgroundColor: c.divider,
  },

  // -- Route Map --
  mapContainer: {
    marginTop: SPACING.xl,
    marginHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: c.surface,
  },
  mapPreview: {
    height: 200,
    borderRadius: 0,
  },

  // -- Ranking Card --
  rankingCard: {
    marginTop: SPACING.xl,
    marginHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  rankingLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  rankBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  rankCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: c.white,
  },
  rankMeta: {
    gap: 2,
  },
  rankPosition: {
    fontSize: 40,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -1,
  },
  rankSuffix: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  rankTotal: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    fontWeight: '500',
  },
  pbBadge: {
    backgroundColor: c.accent,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  pbText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 1,
  },

  // -- Split Times --
  splitsSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
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
    paddingVertical: SPACING.sm + 2,
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
    paddingVertical: SPACING.md,
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
    fontSize: FONT_SIZES.lg,
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
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
    width: 80,
    textAlign: 'center',
  },
  splitTime: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
    width: 80,
    textAlign: 'right',
  },

  // -- Elevation --
  elevationCard: {
    marginTop: SPACING.xl,
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  elevationRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xl,
  },
  elevationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  elevationArrowUp: {
    fontSize: FONT_SIZES.lg,
    color: c.success,
  },
  elevationArrowDown: {
    fontSize: FONT_SIZES.lg,
    color: c.error,
  },
  elevationValue: {
    fontSize: FONT_SIZES.xl,
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
    height: 40,
    backgroundColor: c.divider,
  },

  // -- Uploading --
  uploadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
  },
  uploadingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- Actions --
  actions: {
    gap: SPACING.md,
    paddingTop: SPACING.xxxl,
    paddingHorizontal: SPACING.xxl,
  },
});
