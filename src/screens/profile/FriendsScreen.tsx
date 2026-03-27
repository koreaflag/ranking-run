import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { FriendItem, FriendRequestItem } from '../../types/api';
import { friendService } from '../../services/friendService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<CommunityStackParamList>;
type TabType = 'friends' | 'received' | 'sent';

const PAGE_SIZE = 20;

export default function FriendsScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [received, setReceived] = useState<FriendRequestItem[]>([]);
  const [sent, setSent] = useState<FriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsRes, receivedRes, sentRes] = await Promise.all([
        friendService.getFriends(0, PAGE_SIZE),
        friendService.getReceivedRequests(0, PAGE_SIZE),
        friendService.getSentRequests(0, PAGE_SIZE),
      ]);
      setFriends(friendsRes.data);
      setReceived(receivedRes.data);
      setSent(sentRes.data);
      setPendingCount(receivedRes.total_count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const setActionLoadingForId = (id: string, loading: boolean) => {
    setActionLoading((prev) => {
      const next = new Set(prev);
      if (loading) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleAccept = useCallback(async (requestId: string) => {
    setActionLoadingForId(requestId, true);
    try {
      await friendService.acceptRequest(requestId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Move from received to friends
      setReceived((prev) => prev.filter((r) => r.id !== requestId));
      setPendingCount((prev) => Math.max(0, prev - 1));
      // Reload friends
      const friendsRes = await friendService.getFriends(0, PAGE_SIZE);
      setFriends(friendsRes.data);
    } catch {
      Alert.alert(t('common.errorTitle'), t('friend.actionFailed'));
    } finally {
      setActionLoadingForId(requestId, false);
    }
  }, [t]);

  const handleDecline = useCallback(async (requestId: string) => {
    setActionLoadingForId(requestId, true);
    try {
      await friendService.declineRequest(requestId);
      setReceived((prev) => prev.filter((r) => r.id !== requestId));
      setPendingCount((prev) => Math.max(0, prev - 1));
    } catch {
      Alert.alert(t('common.errorTitle'), t('friend.actionFailed'));
    } finally {
      setActionLoadingForId(requestId, false);
    }
  }, [t]);

  const handleCancelSent = useCallback(async (requestId: string) => {
    setActionLoadingForId(requestId, true);
    try {
      await friendService.cancelRequest(requestId);
      setSent((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      Alert.alert(t('common.errorTitle'), t('friend.actionFailed'));
    } finally {
      setActionLoadingForId(requestId, false);
    }
  }, [t]);

  const handleRemoveFriend = useCallback(async (friendItem: FriendItem) => {
    Alert.alert(
      t('friend.removeFriend'),
      t('friend.removeFriendMsg', { name: friendItem.user.nickname ?? t('profile.defaultNickname') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('friend.remove'),
          style: 'destructive',
          onPress: async () => {
            setActionLoadingForId(friendItem.id, true);
            try {
              await friendService.removeFriend(friendItem.user.id);
              setFriends((prev) => prev.filter((f) => f.id !== friendItem.id));
            } catch {
              Alert.alert(t('common.errorTitle'), t('friend.actionFailed'));
            } finally {
              setActionLoadingForId(friendItem.id, false);
            }
          },
        },
      ],
    );
  }, [t]);

  const renderFriendItem = useCallback(({ item }: { item: FriendItem }) => {
    const initial = (item.user.nickname ?? '?').charAt(0).toUpperCase();
    const isActioning = actionLoading.has(item.id);
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
        activeOpacity={0.7}
      >
        {item.user.avatar_url ? (
          <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.nickname} numberOfLines={1}>
            {item.user.nickname ?? t('profile.defaultNickname')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => handleRemoveFriend(item)}
          activeOpacity={0.6}
          disabled={isActioning}
        >
          {isActioning ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [actionLoading, handleRemoveFriend, navigation, styles, colors, t]);

  const renderReceivedItem = useCallback(({ item }: { item: FriendRequestItem }) => {
    const user = item.requester;
    const initial = (user.nickname ?? '?').charAt(0).toUpperCase();
    const isActioning = actionLoading.has(item.id);
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
        activeOpacity={0.7}
      >
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.nickname} numberOfLines={1}>
            {user.nickname ?? t('profile.defaultNickname')}
          </Text>
        </View>
        {isActioning ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => handleAccept(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.acceptBtnText}>{t('friend.accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => handleDecline(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.declineBtnText}>{t('friend.decline')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [actionLoading, handleAccept, handleDecline, navigation, styles, colors, t]);

  const renderSentItem = useCallback(({ item }: { item: FriendRequestItem }) => {
    const user = item.recipient;
    const initial = (user.nickname ?? '?').charAt(0).toUpperCase();
    const isActioning = actionLoading.has(item.id);
    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
        activeOpacity={0.7}
      >
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.nickname} numberOfLines={1}>
            {user.nickname ?? t('profile.defaultNickname')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => handleCancelSent(item.id)}
          activeOpacity={0.7}
          disabled={isActioning}
        >
          {isActioning ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <Text style={styles.cancelBtnText}>{t('friend.cancelRequest')}</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [actionLoading, handleCancelSent, navigation, styles, colors, t]);

  const headerTitle = t('friend.title');

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'friends': return t('friend.noFriends');
      case 'received': return t('friend.noReceivedRequests');
      case 'sent': return t('friend.noSentRequests');
    }
  };

  const currentData = activeTab === 'friends' ? friends : activeTab === 'received' ? received : sent;
  const currentRender = activeTab === 'friends' ? renderFriendItem : activeTab === 'received' ? renderReceivedItem : renderSentItem;

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
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('FindFriends')}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="person-add-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
            onPress={() => setActiveTab('friends')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
              {t('friend.friendsList')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'received' && styles.tabActive]}
            onPress={() => setActiveTab('received')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
              {t('friend.receivedRequests')}
            </Text>
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
            onPress={() => setActiveTab('sent')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
              {t('friend.sentRequests')}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : currentData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{getEmptyMessage()}</Text>
          </View>
        ) : (
          <FlatList
            data={currentData as any[]}
            keyExtractor={(item) => item.id}
            renderItem={currentRender as any}
            contentContainerStyle={styles.listContent}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            windowSize={10}
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
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },

    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
      gap: SPACING.xs,
    },
    tabActive: {
      backgroundColor: c.primary,
    },
    tabText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tabTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    badge: {
      backgroundColor: c.error,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFFFFF',
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
      fontWeight: '500',
      color: c.textTertiary,
    },

    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 40,
    },

    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      gap: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },

    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.textSecondary,
    },

    userInfo: {
      flex: 1,
    },
    nickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },

    requestActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    acceptBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
    },
    acceptBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    declineBtn: {
      backgroundColor: c.surface,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    declineBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    cancelBtn: {
      backgroundColor: c.surface,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    removeBtn: {
      padding: SPACING.xs,
    },
  });
