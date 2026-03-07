import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import RoutePreview from '../../components/common/RoutePreview';
import type { MyPageStackParamList } from '../../types/navigation';
import type { RunHistoryItem } from '../../types/api';
import { userService } from '../../services/userService';
import {
  formatDistance,
  formatDuration,
  formatPace,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

type Nav = NativeStackNavigationProp<MyPageStackParamList, 'RunHistory'>;

const PAGE_SIZE = 20;

function getRunLabel(run: RunHistoryItem, t: (key: string) => string): string {
  if (run.course) return run.course.title;
  if (run.device_model === 'Apple Watch') return t('mypage.watchRunning');
  return t('mypage.freeRunning');
}

function formatDateKR(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
}

function formatTimeKR(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${period} ${h12}:${m.toString().padStart(2, '0')}`;
}

export default function RunHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(0);

  const loadRuns = useCallback(async (pageNum: number, append: boolean) => {
    try {
      const resp = await userService.getRunHistory(pageNum, PAGE_SIZE);
      if (append) {
        setRuns((prev) => [...prev, ...resp.data]);
      } else {
        setRuns(resp.data);
      }
      setHasNext(resp.has_next);
      setPage(pageNum);
    } catch {
      // Silently handle errors
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadRuns(0, false);
      setLoading(false);
    })();
  }, [loadRuns]);

  const handleLoadMore = useCallback(async () => {
    if (!hasNext || loadingMore) return;
    setLoadingMore(true);
    await loadRuns(page + 1, true);
    setLoadingMore(false);
  }, [hasNext, loadingMore, page, loadRuns]);

  // Group runs by date
  const groupedData = useMemo(() => {
    const groups: { date: string; runs: RunHistoryItem[] }[] = [];
    let currentDate = '';
    let currentGroup: RunHistoryItem[] = [];

    for (const run of runs) {
      const date = formatDateKR(run.finished_at);
      if (date !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, runs: currentGroup });
        }
        currentDate = date;
        currentGroup = [run];
      } else {
        currentGroup.push(run);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, runs: currentGroup });
    }
    return groups;
  }, [runs]);

  const renderRun = useCallback(
    (run: RunHistoryItem, isLast: boolean) => (
      <TouchableOpacity
        key={run.id}
        style={[styles.runCard, !isLast && styles.runCardBorder]}
        onPress={() => navigation.navigate('RunDetail', { runId: run.id })}
        activeOpacity={0.7}
      >
        <View style={styles.runCardInner}>
          {/* Route thumbnail or accent bar */}
          {run.route_preview && run.route_preview.length >= 2 ? (
            <View style={styles.routeThumb}>
              <RoutePreview
                coordinates={run.route_preview}
                width={56}
                height={56}
                strokeColor={colors.primary}
                strokeWidth={2}
                showMap
              />
            </View>
          ) : (
            <View style={styles.routeThumbPlaceholder}>
              <Ionicons name="footsteps" size={20} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.runBody}>
            <View style={styles.runHeader}>
              <Text style={styles.runTitle} numberOfLines={1}>
                {getRunLabel(run, t)}
              </Text>
              <Text style={styles.runTime}>{formatTimeKR(run.finished_at)}</Text>
            </View>
            <View style={styles.runStatsRow}>
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{formatDistance(run.distance_meters)}</Text>
                <Text style={styles.runStatLabel}>{t('running.metrics.distance')}</Text>
              </View>
              <View style={styles.runStatDivider} />
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{formatPace(run.avg_pace_seconds_per_km)}</Text>
                <Text style={styles.runStatLabel}>{t('running.metrics.pace')}</Text>
              </View>
              <View style={styles.runStatDivider} />
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{formatDuration(run.duration_seconds)}</Text>
                <Text style={styles.runStatLabel}>{t('running.metrics.time')}</Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    ),
    [colors, navigation, styles, t],
  );

  const renderGroup = useCallback(
    ({ item }: { item: { date: string; runs: RunHistoryItem[] } }) => (
      <View style={styles.dateGroup}>
        <Text style={styles.dateHeader}>{item.date}</Text>
        <View style={styles.dateCard}>
          {item.runs.map((run, idx) =>
            renderRun(run, idx === item.runs.length - 1),
          )}
        </View>
      </View>
    ),
    [renderRun, styles],
  );

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('mypage.runHistory')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : runs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{t('mypage.noRuns')}</Text>
          </View>
        ) : (
          <FlatList
            data={groupedData}
            keyExtractor={(item) => item.date}
            renderItem={renderGroup}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  style={styles.footerLoader}
                  size="small"
                  color={colors.primary}
                />
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      fontWeight: '500',
    },
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },
    dateGroup: {
      marginBottom: SPACING.lg,
    },
    dateHeader: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textTertiary,
      marginBottom: SPACING.sm,
      fontVariant: ['tabular-nums'],
    },
    dateCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    runCard: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    runCardBorder: {
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    runCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    routeThumb: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    routeThumbPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    runBody: {
      flex: 1,
      gap: SPACING.sm,
    },
    runHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    runTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      flex: 1,
    },
    runTime: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    runStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    runStat: {
      alignItems: 'center',
      gap: 2,
    },
    runStatValue: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    runStatLabel: {
      fontSize: 10,
      fontWeight: '500',
      color: c.textTertiary,
    },
    runStatDivider: {
      width: 1,
      height: 20,
      backgroundColor: c.divider,
    },
    footerLoader: {
      paddingVertical: SPACING.xl,
    },
  });
