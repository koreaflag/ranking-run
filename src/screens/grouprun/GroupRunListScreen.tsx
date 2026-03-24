import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLiveGroupRunStore } from '../../stores/liveGroupRunStore';
import EmptyState from '../../components/common/EmptyState';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import type { LiveGroupRunListItem } from '../../services/liveGroupRunService';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'GroupRunList'>;

export default function GroupRunListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);

  const { groupRuns, isLoadingList, fetchGroupRuns } = useLiveGroupRunStore();

  useFocusEffect(
    useCallback(() => {
      fetchGroupRuns();
    }, [fetchGroupRuns]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGroupRuns();
    setRefreshing(false);
  }, [fetchGroupRuns]);

  const handleItemPress = useCallback(
    (item: LiveGroupRunListItem) => {
      navigation.navigate('GroupRunLobby', { groupRunId: item.id });
    },
    [navigation],
  );

  const handleCreate = useCallback(() => {
    navigation.navigate('GroupRunCreate');
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: LiveGroupRunListItem }) => (
      <GroupRunCard
        item={item}
        onPress={() => handleItemPress(item)}
      />
    ),
    [handleItemPress],
  );

  const keyExtractor = useCallback((item: LiveGroupRunListItem) => item.id, []);

  if (isLoadingList && groupRuns.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('liveGroupRun.title')}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('liveGroupRun.title')}</Text>
        <TouchableOpacity
          onPress={handleCreate}
          style={styles.createBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={groupRuns}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          groupRuns.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            ionicon="people-outline"
            title={t('liveGroupRun.empty')}
            description={t('liveGroupRun.emptyDesc')}
          />
        }
      />
    </SafeAreaView>
  );
}

// ---- Group Run Card ----

const GroupRunCard = React.memo(function GroupRunCard({
  item,
  onPress,
}: {
  item: LiveGroupRunListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isRunning = item.status === 'running';
  const statusColor = isRunning ? colors.success : colors.warning;
  const statusLabel = isRunning
    ? t('liveGroupRun.statusRunning')
    : t('liveGroupRun.statusWaiting');

  const scheduledLabel = item.scheduled_at
    ? new Date(item.scheduled_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        {/* Host avatar */}
        {item.host_avatar_url ? (
          <Image source={{ uri: item.host_avatar_url }} style={styles.hostAvatar} />
        ) : (
          <View style={[styles.hostAvatar, styles.hostAvatarPlaceholder]}>
            <Ionicons name="person" size={14} color={colors.textTertiary} />
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardCourse} numberOfLines={1}>
            {item.course_name}
          </Text>
          <Text style={styles.cardHost}>
            {item.host_nickname}
          </Text>
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.cardMeta}>
          <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.cardMetaText}>
            {item.participant_count}/{item.max_participants}
          </Text>
        </View>
        {scheduledLabel && (
          <View style={styles.cardMeta}>
            <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.cardMetaText}>{scheduledLabel}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: 34,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -1,
    },
    createBtn: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // List
    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
      gap: SPACING.md,
    },
    emptyListContent: {
      flex: 1,
    },

    // Card
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: c.border,
      gap: SPACING.md,
      ...SHADOWS.sm,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    hostAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    hostAvatarPlaceholder: {
      backgroundColor: c.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardContent: {
      flex: 1,
      gap: 2,
    },
    cardTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    cardCourse: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
    },
    cardHost: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
      gap: 4,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
    },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingLeft: 40 + SPACING.md, // aligned with content after avatar
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cardMetaText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
  });
