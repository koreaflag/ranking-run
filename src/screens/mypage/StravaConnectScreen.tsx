import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { stravaService } from '../../services/stravaService';
import { importService } from '../../services/importService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type {
  StravaConnectionStatus,
  StravaActivity,
} from '../../types/api';
import { formatDistance, formatDuration } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

WebBrowser.maybeCompleteAuthSession();

const STRAVA_ORANGE = '#FC4C02';

export default function StravaConnectScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [status, setStatus] = useState<StravaConnectionStatus | null>(null);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set());
  const [alreadyImported, setAlreadyImported] = useState<Set<string>>(
    new Set(),
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const stateRef = useRef<string>('');

  const loadStatus = useCallback(async () => {
    try {
      const s = await stravaService.getStatus();
      setStatus(s);
    } catch {
      // silently fail
    }
  }, []);

  const loadActivities = useCallback(async () => {
    setIsLoadingActivities(true);
    try {
      const [acts, imports] = await Promise.all([
        stravaService.listActivities(),
        importService.listImports(0, 100),
      ]);
      setActivities(acts);
      const imported = new Set<string>(
        imports.data
          .filter((i) => i.source === 'strava' && i.external_id)
          .map((i) => i.external_id!),
      );
      setAlreadyImported(imported);
    } catch {
      Alert.alert('앗...!', 'Strava 활동을 불러오지 못했습니다.');
    } finally {
      setIsLoadingActivities(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      loadActivities();
    }
  }, [status?.connected, loadActivities]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { auth_url, state } = await stravaService.getAuthURL();
      stateRef.current = state;

      const redirectUri = Linking.createURL('strava-callback');
      const result = await WebBrowser.openAuthSessionAsync(
        auth_url,
        redirectUri,
      );

      if (result.type !== 'success') return;

      const parsed = Linking.parse(result.url);
      const code = parsed.queryParams?.code as string | undefined;
      const returnedState = parsed.queryParams?.state as string | undefined;

      if (!code) {
        Alert.alert('앗...!', 'Strava 인증 코드를 받지 못했습니다.');
        return;
      }

      if (returnedState !== stateRef.current) {
        Alert.alert('앗...!', '인증 상태가 일치하지 않습니다.');
        return;
      }

      const newStatus = await stravaService.handleCallback(
        code,
        returnedState,
      );
      setStatus(newStatus);
    } catch {
      Alert.alert('앗...!', 'Strava 연결 중 오류가 발생했습니다.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Strava 연결 해제', '정말 연결을 해제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '해제',
        style: 'destructive',
        onPress: async () => {
          try {
            await stravaService.disconnect();
            setStatus({
              connected: false,
              athlete_name: null,
              athlete_profile_url: null,
              last_sync_at: null,
              auto_sync: false,
            });
            setActivities([]);
          } catch {
            Alert.alert('앗...!', '연결 해제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleSync = async (activity: StravaActivity) => {
    setSyncingIds((prev) => new Set(prev).add(activity.id));
    try {
      await stravaService.syncActivity(activity.id);
      setAlreadyImported((prev) => new Set(prev).add(String(activity.id)));
      Alert.alert(
        'Import 시작',
        '활동을 가져오는 중입니다. Import 이력에서 확인할 수 있습니다.',
      );
    } catch (err: any) {
      const detail =
        err?.data?.detail ?? '활동 가져오기에 실패했습니다.';
      Alert.alert('앗...!', detail);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(activity.id);
        return next;
      });
    }
  };

  const renderActivity = ({ item }: { item: StravaActivity }) => {
    const isImported = alreadyImported.has(String(item.id));
    const isSyncing = syncingIds.has(item.id);

    return (
      <View style={styles.activityCard}>
        <View style={styles.activityLeft}>
          <Text style={styles.activityName} numberOfLines={1}>
            {item.name ?? '이름 없는 활동'}
          </Text>
          <Text style={styles.activityMeta}>
            {item.start_date
              ? new Date(item.start_date).toLocaleDateString('ko-KR')
              : ''}{' '}
            {item.sport_type}
          </Text>
          <View style={styles.activityStats}>
            <Text style={styles.activityStat}>
              {formatDistance(item.distance ?? 0)}
            </Text>
            <Text style={styles.activityStatSep}>·</Text>
            <Text style={styles.activityStat}>
              {formatDuration(item.moving_time ?? 0)}
            </Text>
          </View>
        </View>
        {isImported ? (
          <View style={styles.importedBadge}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.success}
            />
            <Text style={styles.importedText}>완료</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.syncButton}
            onPress={() => handleSync(item)}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.syncButtonText}>가져오기</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Strava 연동</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Not connected */}
      {status !== null && !status.connected && (
        <View style={styles.connectSection}>
          <View style={styles.stravaLogoBox}>
            <Text style={styles.stravaLogoText}>STRAVA</Text>
          </View>
          <Text style={styles.connectTitle}>Strava 계정을 연결하세요</Text>
          <Text style={styles.connectDesc}>
            Strava에서 기록한 달리기를{'\n'}RUNVS로 가져올 수 있습니다.
          </Text>
          <TouchableOpacity
            style={[
              styles.connectButton,
              isConnecting && styles.connectButtonDisabled,
            ]}
            onPress={handleConnect}
            disabled={isConnecting}
            activeOpacity={0.8}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.connectButtonText}>Strava로 연결하기</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Loading initial status */}
      {status === null && (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* Connected */}
      {status?.connected && (
        <>
          {/* Connection info */}
          <View style={styles.connectionCard}>
            {status.athlete_profile_url ? (
              <Image
                source={{ uri: status.athlete_profile_url }}
                style={styles.athleteAvatar}
              />
            ) : (
              <View
                style={[styles.athleteAvatar, styles.avatarPlaceholder]}
              >
                <Ionicons
                  name="person"
                  size={20}
                  color={colors.textTertiary}
                />
              </View>
            )}
            <View style={styles.connectionInfo}>
              <View style={styles.connectedBadgeRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.connectedBadgeText}>연결됨</Text>
              </View>
              <Text style={styles.athleteName}>
                {status.athlete_name ?? 'Strava 사용자'}
              </Text>
              {status.last_sync_at && (
                <Text style={styles.lastSync}>
                  마지막 동기화:{' '}
                  {new Date(status.last_sync_at).toLocaleString('ko-KR')}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={handleDisconnect}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close-circle-outline"
                size={22}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          </View>

          {/* Activity list header */}
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>최근 활동</Text>
            <TouchableOpacity onPress={loadActivities} activeOpacity={0.7}>
              <Ionicons
                name="refresh"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {isLoadingActivities ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={activities}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderActivity}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons
                    name="walk-outline"
                    size={40}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.emptyText}>
                    최근 러닝 활동이 없습니다
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },

    // Connect state
    connectSection: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xxxl,
      gap: SPACING.lg,
    },
    stravaLogoBox: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: STRAVA_ORANGE,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stravaLogoText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 14,
      letterSpacing: 1,
    },
    connectTitle: {
      fontSize: FONT_SIZES.title,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    connectDesc: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    connectButton: {
      backgroundColor: STRAVA_ORANGE,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xxxl,
      borderRadius: BORDER_RADIUS.full,
      minWidth: 200,
      alignItems: 'center',
    },
    connectButtonDisabled: { opacity: 0.6 },
    connectButtonText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: FONT_SIZES.md,
    },

    // Connection card
    connectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: SPACING.xl,
      marginTop: SPACING.md,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      borderWidth: 1,
      borderColor: c.border,
      gap: SPACING.lg,
    },
    athleteAvatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: {
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    connectionInfo: { flex: 1, gap: SPACING.xs },
    connectedBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    connectedBadgeText: {
      fontSize: FONT_SIZES.xs,
      color: c.success,
      fontWeight: '700',
    },
    athleteName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    lastSync: { fontSize: FONT_SIZES.xs, color: c.textTertiary },

    // Activity list
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      marginTop: SPACING.xxl,
      marginBottom: SPACING.md,
    },
    listHeaderTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },

    activityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      borderWidth: 1,
      borderColor: c.border,
    },
    activityLeft: { flex: 1, gap: SPACING.xs },
    activityName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    activityMeta: { fontSize: FONT_SIZES.xs, color: c.textTertiary },
    activityStats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    activityStat: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    activityStatSep: { color: c.textTertiary },

    syncButton: {
      backgroundColor: STRAVA_ORANGE,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.full,
      minWidth: 72,
      alignItems: 'center',
    },
    syncButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: FONT_SIZES.sm,
    },

    importedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    importedText: {
      fontSize: FONT_SIZES.sm,
      color: c.success,
      fontWeight: '600',
    },

    loadingCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: SPACING.xxxl,
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      fontWeight: '500',
    },
  });
