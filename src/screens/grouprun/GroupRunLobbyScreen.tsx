import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLiveGroupRunStore } from '../../stores/liveGroupRunStore';
import { liveGroupRunService, type LiveGroupRunParticipant } from '../../services/liveGroupRunService';
import { useAuthStore } from '../../stores/authStore';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import {
  COLORS,
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

type LobbyRoute = RouteProp<HomeStackParamList, 'GroupRunLobby'>;
type Nav = NativeStackNavigationProp<HomeStackParamList, 'GroupRunLobby'>;

export default function GroupRunLobbyScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<LobbyRoute>();
  const { groupRunId } = route.params;
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currentUser = useAuthStore((s) => s.user);
  const {
    selectedGroupRun,
    isLoadingDetail,
    participants,
    wsConnected,
    fetchGroupRunDetail,
    joinGroupRun,
    startGroupRun,
    setWsConnected,
    updateParticipants,
    updateGroupRunStatus,
    markParticipantCompleted,
  } = useLiveGroupRunStore();

  const wsRef = useRef<WebSocket | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load detail on mount
  useEffect(() => {
    fetchGroupRunDetail(groupRunId).catch(() => {
      Alert.alert(t('common.error'), t('liveGroupRun.loadError'));
    });
  }, [groupRunId, fetchGroupRunDetail, t]);

  // WebSocket connection
  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      try {
        const wsUrl = await liveGroupRunService.buildWsUrl(groupRunId);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (mounted) setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
              case 'participants':
                updateParticipants(msg.data);
                break;
              case 'started':
                updateGroupRunStatus('running');
                break;
              case 'completed':
                if (msg.user_id) {
                  markParticipantCompleted(msg.user_id);
                }
                break;
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (mounted) {
            setWsConnected(false);
            // Auto-reconnect after 3s
            reconnectTimerRef.current = setTimeout(() => {
              if (mounted) connect();
            }, 3000);
          }
        };

        ws.onerror = () => {
          if (mounted) setWsConnected(false);
        };

        wsRef.current = ws;
      } catch {
        if (mounted) setWsConnected(false);
      }
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [groupRunId, setWsConnected, updateParticipants, updateGroupRunStatus, markParticipantCompleted]);

  const isHost = selectedGroupRun?.host_user_id === currentUser?.id;
  const isParticipant = participants.some((p) => p.user_id === currentUser?.id);
  const isWaiting = selectedGroupRun?.status === 'waiting';
  const isRunning = selectedGroupRun?.status === 'running';

  const handleJoin = useCallback(async () => {
    setIsJoining(true);
    try {
      await joinGroupRun(groupRunId);
    } catch {
      Alert.alert(t('common.error'), t('liveGroupRun.joinFailed'));
    } finally {
      setIsJoining(false);
    }
  }, [groupRunId, joinGroupRun, t]);

  const handleStart = useCallback(async () => {
    Alert.alert(
      t('liveGroupRun.startConfirmTitle'),
      t('liveGroupRun.startConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('liveGroupRun.start'),
          onPress: async () => {
            setIsStarting(true);
            try {
              await startGroupRun(groupRunId);
            } catch {
              Alert.alert(t('common.error'), t('liveGroupRun.startFailed'));
            } finally {
              setIsStarting(false);
            }
          },
        },
      ],
    );
  }, [groupRunId, startGroupRun, t]);

  const renderParticipant = useCallback(
    ({ item }: { item: LiveGroupRunParticipant }) => (
      <ParticipantRow
        participant={item}
        isMe={item.user_id === currentUser?.id}
        isRunning={isRunning}
      />
    ),
    [currentUser?.id, isRunning],
  );

  const keyExtractor = useCallback((item: LiveGroupRunParticipant) => item.user_id, []);

  if (isLoadingDetail && !selectedGroupRun) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedGroupRun) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{t('liveGroupRun.loadError')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title={selectedGroupRun.title}
        onBack={() => navigation.goBack()}
        rightAction={
          <View style={[styles.wsIndicator, { backgroundColor: wsConnected ? colors.success : colors.error }]} />
        }
      />

      {/* Course Info Card */}
      <View style={styles.courseCard}>
        <Ionicons name="map-outline" size={20} color={colors.primary} />
        <View style={styles.courseCardContent}>
          <Text style={styles.courseCardName}>{selectedGroupRun.course_name}</Text>
          <Text style={styles.courseCardStatus}>
            {isWaiting
              ? t('liveGroupRun.statusWaiting')
              : isRunning
                ? t('liveGroupRun.statusRunning')
                : t('liveGroupRun.statusCompleted')}
          </Text>
        </View>
        <View style={styles.participantCountBadge}>
          <Ionicons name="people" size={14} color={colors.primary} />
          <Text style={styles.participantCountText}>
            {participants.length}/{selectedGroupRun.max_participants}
          </Text>
        </View>
      </View>

      {/* Participant List */}
      <View style={styles.participantsSection}>
        <Text style={styles.sectionTitle}>
          {t('liveGroupRun.participants')} ({participants.length})
        </Text>
        <FlatList
          data={participants}
          renderItem={renderParticipant}
          keyExtractor={keyExtractor}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.participantList}
        />
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {isWaiting && !isParticipant && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleJoin}
            disabled={isJoining}
            activeOpacity={0.8}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="enter-outline" size={20} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('liveGroupRun.join')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isWaiting && isHost && (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.startBtn]}
            onPress={handleStart}
            disabled={isStarting || participants.length < 2}
            activeOpacity={0.8}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="play" size={20} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>{t('liveGroupRun.start')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isWaiting && isParticipant && !isHost && (
          <View style={styles.waitingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.waitingText}>{t('liveGroupRun.waitingForHost')}</Text>
          </View>
        )}

        {isRunning && isParticipant && (
          <View style={styles.runningBanner}>
            <View style={[styles.runningDot, { backgroundColor: colors.success }]} />
            <Text style={styles.runningText}>{t('liveGroupRun.runInProgress')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---- Participant Row ----

const ParticipantRow = React.memo(function ParticipantRow({
  participant,
  isMe,
  isRunning,
}: {
  participant: LiveGroupRunParticipant;
  isMe: boolean;
  isRunning: boolean;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const statusColors: Record<string, string> = {
    waiting: colors.warning,
    running: colors.success,
    completed: colors.primary,
  };

  const statusLabels: Record<string, string> = {
    waiting: t('liveGroupRun.participantWaiting'),
    running: t('liveGroupRun.participantRunning'),
    completed: t('liveGroupRun.participantCompleted'),
  };

  return (
    <View style={[styles.participantRow, isMe && styles.participantRowMe]}>
      {participant.avatar_url ? (
        <Image source={{ uri: participant.avatar_url }} style={styles.participantAvatar} />
      ) : (
        <View style={[styles.participantAvatar, styles.participantAvatarPlaceholder]}>
          <Ionicons name="person" size={14} color={colors.textTertiary} />
        </View>
      )}

      <View style={styles.participantInfo}>
        <Text style={[styles.participantName, isMe && { color: colors.primary, fontWeight: '800' }]}>
          {participant.nickname}
          {isMe ? ' (ME)' : ''}
        </Text>
        <View
          style={[
            styles.participantStatusBadge,
            { backgroundColor: (statusColors[participant.status] || colors.textTertiary) + '20' },
          ]}
        >
          <Text
            style={[
              styles.participantStatusText,
              { color: statusColors[participant.status] || colors.textTertiary },
            ]}
          >
            {statusLabels[participant.status] || participant.status}
          </Text>
        </View>
      </View>

      {isRunning && participant.status === 'running' && participant.current_distance_m > 0 && (
        <Text style={styles.participantDistance}>
          {(participant.current_distance_m / 1000).toFixed(2)} km
        </Text>
      )}
    </View>
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
    errorText: {
      fontSize: FONT_SIZES.md,
      color: c.textSecondary,
      textAlign: 'center',
    },

    // WS indicator
    wsIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    // Course card
    courseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: SPACING.xxl,
      marginTop: SPACING.md,
      padding: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    courseCardContent: {
      flex: 1,
      gap: 2,
    },
    courseCardName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    courseCardStatus: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    participantCountBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.primary + '15',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
    },
    participantCountText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },

    // Participants
    participantsSection: {
      flex: 1,
      marginTop: SPACING.xl,
      paddingHorizontal: SPACING.xxl,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
      marginBottom: SPACING.md,
    },
    participantList: {
      gap: SPACING.xs,
      paddingBottom: SPACING.xl,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
      gap: SPACING.md,
    },
    participantRowMe: {
      backgroundColor: c.primary + '0D',
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.sm,
      marginHorizontal: -SPACING.sm,
    },
    participantAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    participantAvatarPlaceholder: {
      backgroundColor: c.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    participantInfo: {
      flex: 1,
      gap: 4,
    },
    participantName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    participantStatusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    participantStatusText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
    },
    participantDistance: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },

    // Bottom actions
    bottomActions: {
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.lg,
      paddingBottom: SPACING.xxxl,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      gap: SPACING.sm,
      ...SHADOWS.glow,
    },
    startBtn: {
      backgroundColor: c.success,
      shadowColor: c.success,
    },
    primaryBtnText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: COLORS.white,
    },
    waitingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary + '10',
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      gap: SPACING.md,
    },
    waitingText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.primary,
    },
    runningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.success + '10',
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      gap: SPACING.sm,
    },
    runningDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    runningText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.success,
    },
  });
