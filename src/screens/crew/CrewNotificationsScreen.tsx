import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewJoinRequestItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatRelativeTime } from '../../utils/format';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewNotifications'>;
type Route = RouteProp<HomeStackParamList, 'CrewNotifications'>;

export default function CrewNotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { crewId } = route.params;

  const [requests, setRequests] = useState<CrewJoinRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadRequests = useCallback(async (isRefresh = false) => {
    try {
      const res = await crewService.getPendingRequests(crewId, { per_page: 50 });
      setRequests(Array.isArray(res?.data) ? res.data : []);
    } catch {
      if (!isRefresh) setRequests([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [crewId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadRequests(true);
  }, [loadRequests]);

  const handleApprove = useCallback(async (requestId: string) => {
    setProcessingIds((prev) => new Set(prev).add(requestId));
    try {
      await crewService.approveRequest(crewId, requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.approveFailed'));
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  }, [crewId, t]);

  const handleReject = useCallback(async (requestId: string) => {
    setProcessingIds((prev) => new Set(prev).add(requestId));
    try {
      await crewService.rejectRequest(crewId, requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.rejectFailed'));
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  }, [crewId, t]);

  const renderRequest = useCallback(
    ({ item }: { item: CrewJoinRequestItem }) => {
      const initial = (item.user.nickname ?? '?').charAt(0).toUpperCase();
      const isProcessing = processingIds.has(item.id);

      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            {item.user.avatar_url ? (
              <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.nickname} numberOfLines={1}>
                {item.user.nickname ?? '?'}
              </Text>
              <Text style={styles.timeText}>{formatRelativeTime(item.created_at)}</Text>
            </View>
          </View>
          {item.message && (
            <Text style={styles.message} numberOfLines={3}>
              {item.message}
            </Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => handleReject(item.id)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={styles.rejectBtnText}>{t('crew.reject')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={() => handleApprove(item.id)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.approveBtnText}>{t('crew.approve')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [colors, styles, processingIds, handleApprove, handleReject, t],
  );

  const keyExtractor = useCallback((item: CrewJoinRequestItem) => item.id, []);

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
          <Text style={styles.headerTitle}>{t('crew.notifications')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={requests}
            renderItem={renderRequest}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-circle-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>{t('crew.noNotifications')}</Text>
                <Text style={styles.emptyDesc}>{t('crew.noNotificationsDesc')}</Text>
              </View>
            }
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
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.sm,
    },

    // Request card
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
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
    avatarText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.textSecondary,
    },
    cardInfo: {
      flex: 1,
      gap: 2,
    },
    nickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    timeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    message: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      lineHeight: 20,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },

    // Action buttons
    actionRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    rejectBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
    },
    rejectBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    approveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary,
    },
    approveBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Empty state
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 100,
      gap: SPACING.md,
    },
    emptyTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textSecondary,
    },
    emptyDesc: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
      textAlign: 'center',
      paddingHorizontal: SPACING.xxl,
    },
  });
