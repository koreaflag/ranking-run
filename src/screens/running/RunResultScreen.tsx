import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useRunningStore } from '../../stores/runningStore';
import { runService } from '../../services/runService';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import RouteMapView from '../../components/map/RouteMapView';
import type { RunningStackParamList } from '../../types/navigation';
import type { RunCompleteResponse, Split } from '../../types/api';
import {
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type ResultRoute = RouteProp<RunningStackParamList, 'RunResult'>;

export default function RunResultScreen() {
  const navigation = useNavigation();
  const route = useRoute<ResultRoute>();
  const { sessionId } = route.params;

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
            coordinates: routePoints.map((p) => [p.longitude, p.latitude, 0]),
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
      } catch {
        // Silently fail - data is saved locally via chunks
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

  const handleGoHome = () => {
    reset();
    navigation.getParent()?.navigate('HomeTab');
  };

  const handleRegisterCourse = () => {
    if (!result) return;
    Alert.alert(
      '코스 등록',
      '이 런닝 경로를 코스로 등록하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '등록',
          onPress: () => {
            // In full implementation, this would navigate to a course registration form
            Alert.alert('안내', '코스 등록 기능은 다음 업데이트에서 지원됩니다.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🎉</Text>
          <Text style={styles.headerTitle}>런닝 완료!</Text>
          {courseId && (
            <Text style={styles.headerSubtitle}>코스 런닝</Text>
          )}
        </View>

        {/* Route Map */}
        <RouteMapView routePoints={routePoints} style={styles.mapPreview} />

        {/* Primary Stats */}
        <Card style={styles.primaryStats}>
          <View style={styles.statsRow}>
            <StatItem
              label="거리"
              value={metersToKm(distanceMeters)}
              unit="km"
              large
            />
          </View>
          <View style={styles.statsGrid}>
            <StatItem
              label="시간"
              value={formatDuration(durationSeconds)}
            />
            <StatItem
              label="평균 페이스"
              value={formatPace(avgPaceSecondsPerKm)}
            />
            <StatItem
              label="칼로리"
              value={`${calories}`}
              unit="kcal"
            />
          </View>
        </Card>

        {/* Elevation */}
        {(elevationGainMeters > 0 || elevationLossMeters > 0) && (
          <Card style={styles.elevationCard}>
            <Text style={styles.cardTitle}>고도 변화</Text>
            <View style={styles.elevationRow}>
              <StatItem
                label="상승"
                value={`+${Math.round(elevationGainMeters)}`}
                unit="m"
              />
              <StatItem
                label="하강"
                value={`-${Math.round(elevationLossMeters)}`}
                unit="m"
              />
            </View>
          </Card>
        )}

        {/* Splits */}
        {splits.length > 0 && (
          <Card style={styles.splitsCard}>
            <Text style={styles.cardTitle}>구간 기록</Text>
            {splits.map((split: Split) => (
              <View key={split.split_number} style={styles.splitRow}>
                <Text style={styles.splitKm}>
                  {split.split_number}km
                </Text>
                <Text style={styles.splitPace}>
                  {formatPace(split.pace_seconds_per_km)}
                </Text>
                <Text style={styles.splitTime}>
                  {formatDuration(split.duration_seconds)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Ranking (if course run) */}
        {result?.ranking && (
          <Card style={styles.rankingCard}>
            <Text style={styles.cardTitle}>코스 랭킹</Text>
            <View style={styles.rankingContent}>
              <Text style={styles.rankNumber}>
                {result.ranking.rank}위
              </Text>
              <Text style={styles.rankTotal}>
                / {result.ranking.total_runners}명
              </Text>
            </View>
            {result.ranking.is_personal_best && (
              <View style={styles.pbBadge}>
                <Text style={styles.pbText}>개인 최고 기록!</Text>
              </View>
            )}
          </Card>
        )}

        {/* Server submission status */}
        {isSubmitting && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.uploadingText}>기록 저장 중...</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {!courseId && result && (
            <Button
              title="코스로 등록"
              variant="outline"
              onPress={handleRegisterCourse}
              fullWidth
              size="lg"
            />
          )}
          <Button
            title="홈으로"
            onPress={handleGoHome}
            fullWidth
            size="lg"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    gap: SPACING.sm,
  },
  headerEmoji: {
    fontSize: 48,
  },
  headerTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: '900',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.primary,
    fontWeight: '600',
  },
  mapPreview: {
    height: 200,
    borderRadius: BORDER_RADIUS.lg,
  },
  primaryStats: {
    gap: SPACING.lg,
  },
  statsRow: {
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  elevationCard: {
    gap: SPACING.md,
  },
  elevationRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  splitsCard: {
    gap: SPACING.md,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  splitKm: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    width: 50,
  },
  splitPace: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  splitTime: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rankingCard: {
    gap: SPACING.md,
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  },
  rankingContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  rankNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.accent,
  },
  rankTotal: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  pbBadge: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  pbText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  uploadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  uploadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  actions: {
    gap: SPACING.md,
    paddingTop: SPACING.md,
  },
});
