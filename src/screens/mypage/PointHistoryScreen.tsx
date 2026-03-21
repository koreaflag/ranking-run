import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import api from '../../services/api';
import type { PointTransactionItem, PointHistoryResponse } from '../../types/api';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { ListEndIndicator } from '../../components/common/Skeleton';

const TX_TYPE_CONFIG: Record<string, { icon: string; color: string; labelKey: string }> = {
  run_earn: { icon: 'walk-outline', color: '#34C759', labelKey: 'points.runEarn' },
  course_bonus: { icon: 'trophy-outline', color: '#FF9500', labelKey: 'points.courseBonus' },
  crew_create: { icon: 'people-outline', color: '#FF3B30', labelKey: 'points.crewCreate' },
  daily_checkin: { icon: 'calendar-outline', color: '#5856D6', labelKey: 'points.dailyCheckin' },
  course_create: { icon: 'map-outline', color: '#007AFF', labelKey: 'points.courseCreate' },
};

export default function PointHistoryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const colors = useTheme();

  const [data, setData] = useState<PointTransactionItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const res = await api.get<PointHistoryResponse>(`/users/me/points/history?page=${p}&limit=20`);
      if (p === 0) {
        setData(res.data);
      } else {
        setData(prev => [...prev, ...res.data]);
      }
      setHasNext(res.has_next);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = () => {
    if (!hasNext || loading) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  };

  const renderItem = ({ item }: { item: PointTransactionItem }) => {
    const config = TX_TYPE_CONFIG[item.tx_type] ?? TX_TYPE_CONFIG.run_earn;
    const isPositive = item.amount > 0;
    return (
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: config.color + '18' }]}>
          <Ionicons name={config.icon as any} size={18} color={config.color} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.txLabel, { color: colors.text }]}>
            {t(config.labelKey)}
          </Text>
          <Text style={[styles.txDate, { color: colors.textTertiary }]}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: isPositive ? '#34C759' : '#FF3B30' }]}>
          {isPositive ? '+' : ''}{item.amount}P
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('points.history')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && data.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              {t('points.history')}
            </Text>
          }
          ListFooterComponent={
            hasNext && data.length > 0 ? (
              <ActivityIndicator style={{ padding: 16 }} color={colors.primary} />
            ) : !hasNext && data.length > 0 ? (
              <ListEndIndicator text={t('common.endOfList')} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  rowContent: {
    flex: 1,
  },
  txLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
  },
  txDate: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  txAmount: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: FONT_SIZES.md,
  },
});
