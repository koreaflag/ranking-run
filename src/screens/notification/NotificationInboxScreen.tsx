import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { NotificationItem } from '../../types/api';
import { notificationService } from '../../services/notificationService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatRelativeTime } from '../../utils/format';
import { ListEndIndicator } from '../../components/common/Skeleton';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'NotificationInbox'>;

const PER_PAGE = 20;
const AVATAR_SIZE = 40;

const NOTIFICATION_ICONS: Record<string, { name: string; color: string }> = {
  post_comment: { name: 'chatbubble', color: '#3B82F6' },
  post_like: { name: 'heart', color: '#EF4444' },
  crew_join_request: { name: 'person-add', color: '#FF7A33' },
  follow: { name: 'person-add-outline', color: '#10B981' },
  friend_request: { name: 'people', color: '#8B5CF6' },
  run_completed: { name: 'footsteps', color: '#FF7A33' },
};

function getNotificationMessage(item: NotificationItem, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const name = item.actor.nickname ?? '?';
  switch (item.type) {
    case 'post_comment':
      return `${name}${t('notification.postComment')}`;
    case 'post_like':
      return `${name}${t('notification.postLike')}`;
    case 'crew_join_request': {
      const crewName = item.data?.crew_name ?? '';
      return `${name}${t('notification.crewJoinRequest', { crew: crewName })}`;
    }
    case 'follow':
      return `${name}${t('notification.followed')}`;
    case 'friend_request':
      return `${name}${t('notification.friendRequest')}`;
    case 'run_completed':
      return `${name}${t('notification.runCompleted')}`;
    default:
      return name;
  }
}

export default function NotificationInboxScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadNotifications = useCallback(
    async (p: number, refresh = false) => {
      try {
        const res = await notificationService.getNotifications({
          page: p,
          per_page: PER_PAGE,
        });
        const items = Array.isArray(res?.data) ? res.data : [];
        setNotifications((prev) => (refresh ? items : [...prev, ...items]));
        setTotalCount(res?.total_count ?? 0);
        setPage(p);
      } catch {
        if (refresh) {
          setNotifications([]);
          setTotalCount(0);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setIsLoading(true);
    loadNotifications(0, true);
  }, [loadNotifications]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications(0, true);
  }, [loadNotifications]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || notifications.length >= totalCount) return;
    setLoadingMore(true);
    loadNotifications(page + 1);
  }, [loadingMore, notifications.length, totalCount, page, loadNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true })),
      );
    } catch {
      // ignore
    }
  }, []);

  const handlePress = useCallback(
    async (item: NotificationItem) => {
      // Mark as read
      if (!item.is_read) {
        try {
          await notificationService.markAsRead(item.id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
          );
        } catch {
          // ignore
        }
      }

      // Navigate based on type
      switch (item.type) {
        case 'post_comment':
        case 'post_like':
          if (item.target_id) {
            navigation.navigate('CommunityPostDetail', { postId: item.target_id });
          }
          break;
        case 'crew_join_request':
          if (item.target_id) {
            navigation.navigate('CrewManage', { crewId: item.target_id });
          }
          break;
        case 'follow':
        case 'friend_request':
          navigation.navigate('UserProfile', { userId: item.actor.id });
          break;
        case 'run_completed':
          if (item.target_id) {
            navigation.navigate('RunDetail', { runId: item.target_id });
          } else {
            navigation.navigate('UserProfile', { userId: item.actor.id });
          }
          break;
      }
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => {
      const initial = (item.actor.nickname ?? '?').charAt(0).toUpperCase();
      const iconConfig = NOTIFICATION_ICONS[item.type] ?? { name: 'notifications', color: colors.textTertiary };
      const message = getNotificationMessage(item, t);

      return (
        <TouchableOpacity
          style={[styles.card, !item.is_read && styles.cardUnread]}
          onPress={() => handlePress(item)}
          activeOpacity={0.6}
        >
          <View style={styles.cardRow}>
            {/* Unread dot */}
            <View style={styles.dotContainer}>
              {!item.is_read && <View style={styles.unreadDot} />}
            </View>

            {/* Avatar */}
            {item.actor.avatar_url ? (
              <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}

            {/* Content */}
            <View style={styles.cardContent}>
              <Text style={[styles.messageText, !item.is_read && styles.messageTextUnread]} numberOfLines={2}>
                {message}
              </Text>
              <Text style={styles.timeText}>{formatRelativeTime(item.created_at)}</Text>
            </View>

            {/* Type icon */}
            <View style={[styles.typeIcon, { backgroundColor: iconConfig.color + '18' }]}>
              <Ionicons name={iconConfig.name as any} size={14} color={iconConfig.color} />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, styles, t, handlePress],
  );

  const keyExtractor = useCallback((item: NotificationItem) => item.id, []);

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('notification.title')}</Text>
          {hasUnread ? (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.markAllReadText}>{t('notification.markAllRead')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyText}>{t('notification.noNotifications')}</Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : notifications.length >= totalCount && notifications.length > 0 ? (
                <ListEndIndicator text={t('common.endOfList')} />
              ) : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            windowSize={10}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    markAllReadText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.primary,
    },

    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xxxl,
    },

    card: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    cardUnread: {
      backgroundColor: c.primary + '08',
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },

    dotContainer: {
      width: 8,
      alignItems: 'center',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
    },

    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
    },
    avatarPlaceholder: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.textSecondary,
    },

    cardContent: {
      flex: 1,
      gap: 2,
    },
    messageText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '400',
      color: c.textSecondary,
      lineHeight: 19,
    },
    messageTextUnread: {
      fontWeight: '600',
      color: c.text,
    },
    timeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    typeIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },

    emptyContainer: {
      alignItems: 'center',
      paddingTop: 100,
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textTertiary,
      textAlign: 'center',
    },

    footerLoader: {
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },
  });
