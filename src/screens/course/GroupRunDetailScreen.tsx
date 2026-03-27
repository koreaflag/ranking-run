import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  TextInput,
  Platform,
  StatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { GroupRunItem, GroupRunMemberInfo } from '../../types/api';
import { groupRunService } from '../../services/groupRunService';
import { userService } from '../../services/userService';
import { useAuthStore } from '../../stores/authStore';
import ScreenHeader from '../../components/common/ScreenHeader';
import { formatDuration, formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

// Legacy type — this screen will be removed in Phase 2
type GroupRunDetailParamList = {
  GroupRunDetail: { groupRunId: string };
};

type DetailRoute = RouteProp<GroupRunDetailParamList, 'GroupRunDetail'>;

export default function GroupRunDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { groupRunId } = route.params;

  const IS_ANDROID = Platform.OS === 'android';
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const [groupRun, setGroupRun] = useState<GroupRunItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [androidInviteModalMounted, setAndroidInviteModalMounted] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<Array<{ id: string; nickname: string }>>([]);
  const [isInviting, setIsInviting] = useState(false);

  // Android: sync overlay mount state with showInviteModal
  useEffect(() => {
    if (IS_ANDROID) {
      if (showInviteModal) {
        setAndroidInviteModalMounted(true);
      } else {
        setAndroidInviteModalMounted(false);
      }
    }
  }, [showInviteModal, IS_ANDROID]);

  // Android: handle back button for invite modal
  useEffect(() => {
    if (!IS_ANDROID || !androidInviteModalMounted) return;
    const onBack = () => {
      setShowInviteModal(false);
      setInvitedUsers([]);
      setInviteCode('');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [IS_ANDROID, androidInviteModalMounted]);

  const loadGroupRun = useCallback(async () => {
    try {
      const data = await groupRunService.getGroupRun(groupRunId);
      setGroupRun(data);
    } catch {
      Alert.alert(t('common.error'), t('groupRun.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [groupRunId, t]);

  useEffect(() => {
    loadGroupRun();
  }, [loadGroupRun]);

  const isCreator = groupRun?.creator_id === currentUser?.id;
  const myStatus = groupRun?.my_status;

  const handleAccept = useCallback(async () => {
    try {
      const data = await groupRunService.acceptInvite(groupRunId);
      setGroupRun(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('review.unknownError');
      Alert.alert(t('common.error'), msg);
    }
  }, [groupRunId, t]);

  const handleDecline = useCallback(async () => {
    Alert.alert(t('groupRun.declineTitle'), t('groupRun.declineMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupRun.decline'),
        style: 'destructive',
        onPress: async () => {
          try {
            await groupRunService.declineInvite(groupRunId);
            navigation.goBack();
          } catch (err) {
            const msg = err instanceof Error ? err.message : t('review.unknownError');
            Alert.alert(t('common.error'), msg);
          }
        },
      },
    ]);
  }, [groupRunId, t, navigation]);

  const handleLeave = useCallback(async () => {
    Alert.alert(t('groupRun.leaveTitle'), t('groupRun.leaveMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupRun.leave'),
        style: 'destructive',
        onPress: async () => {
          try {
            await groupRunService.leaveGroup(groupRunId);
            navigation.goBack();
          } catch (err) {
            const msg = err instanceof Error ? err.message : t('review.unknownError');
            Alert.alert(t('common.error'), msg);
          }
        },
      },
    ]);
  }, [groupRunId, t, navigation]);

  const handleDisband = useCallback(async () => {
    Alert.alert(t('groupRun.disbandTitle'), t('groupRun.disbandMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupRun.disband'),
        style: 'destructive',
        onPress: async () => {
          try {
            await groupRunService.disbandGroup(groupRunId);
            navigation.goBack();
          } catch (err) {
            const msg = err instanceof Error ? err.message : t('review.unknownError');
            Alert.alert(t('common.error'), msg);
          }
        },
      },
    ]);
  }, [groupRunId, t, navigation]);

  const handleRunCourse = useCallback(() => {
    if (groupRun?.course_id) {
      navigation.getParent()?.navigate('WorldTab', { screen: 'RunningMain', params: { courseId: groupRun.course_id } });
    }
  }, [groupRun, navigation]);

  const maxInvitable = groupRun ? 5 - groupRun.member_count : 0;

  const handleAddInvitee = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    try {
      const user = await userService.searchByCode(code);
      if (!user) {
        Alert.alert(t('common.error'), t('groupRun.userNotFound'));
        return;
      }
      if (user.id === currentUser?.id) {
        Alert.alert(t('common.error'), t('groupRun.cannotInviteSelf'));
        return;
      }
      if (groupRun?.members.some((m) => m.user_id === user.id) || invitedUsers.some((u) => u.id === user.id)) {
        Alert.alert(t('common.error'), t('groupRun.alreadyAdded'));
        return;
      }
      if (invitedUsers.length >= maxInvitable) {
        Alert.alert(t('common.error'), t('groupRun.maxMembers'));
        return;
      }
      setInvitedUsers((prev) => [...prev, { id: user.id, nickname: user.nickname || code }]);
      setInviteCode('');
    } catch {
      Alert.alert(t('common.error'), t('groupRun.userNotFound'));
    }
  }, [inviteCode, invitedUsers, currentUser, groupRun, maxInvitable, t]);

  const handleSubmitInvite = useCallback(async () => {
    if (invitedUsers.length === 0 || !groupRun) return;
    setIsInviting(true);
    try {
      const data = await groupRunService.inviteMembers(groupRun.id, invitedUsers.map((u) => u.id));
      setGroupRun(data);
      setShowInviteModal(false);
      setInvitedUsers([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('review.unknownError');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsInviting(false);
    }
  }, [invitedUsers, groupRun, t]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!groupRun) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{t('groupRun.loadError')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completedMembers = groupRun.members.filter((m) => m.status === 'completed');
  const sortedMembers = [...groupRun.members].sort((a, b) => {
    // Completed first, then by best time
    if (a.status === 'completed' && b.status !== 'completed') return -1;
    if (a.status !== 'completed' && b.status === 'completed') return 1;
    if (a.best_duration_seconds && b.best_duration_seconds) {
      return a.best_duration_seconds - b.best_duration_seconds;
    }
    return 0;
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title={groupRun.name} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Course Info */}
        <TouchableOpacity
          style={styles.courseCard}
          onPress={() => (navigation as any).navigate('CourseDetail', { courseId: groupRun.course_id })}
          activeOpacity={0.7}
        >
          <Ionicons name="map-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.courseCardName}>{groupRun.course_name || t('groupRun.title')}</Text>
            <Text style={styles.courseCardSub}>{t('course.detail.viewCourse')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Group Ranking Card */}
        {groupRun.group_ranking && (
          <View style={styles.rankingCard}>
            <Text style={styles.rankingCardRank}>#{groupRun.group_ranking.rank}</Text>
            <View>
              <Text style={styles.rankingCardTime}>
                {formatDuration(groupRun.group_ranking.avg_duration_seconds)}
              </Text>
              <Text style={styles.rankingCardLabel}>{t('groupRun.avgTime')}</Text>
            </View>
          </View>
        )}

        {!groupRun.group_ranking && completedMembers.length < 2 && (
          <View style={styles.rankingCardPending}>
            <Ionicons name="hourglass-outline" size={24} color={colors.textTertiary} />
            <Text style={styles.rankingCardPendingText}>{t('groupRun.minMembers')}</Text>
            <Text style={styles.rankingCardPendingSub}>
              {t('groupRun.completedCount', { count: completedMembers.length, total: groupRun.member_count })}
            </Text>
          </View>
        )}

        {/* Members */}
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>
            {t('groupRun.members')} ({groupRun.member_count})
          </Text>
          {sortedMembers.map((member, index) => (
            <MemberRow
              key={member.user_id}
              member={member}
              index={index}
              isMe={member.user_id === currentUser?.id}
              isCompleted={member.status === 'completed'}
            />
          ))}

          {isCreator && groupRun.status === 'active' && groupRun.member_count < 5 && (
            <TouchableOpacity
              style={styles.inviteMoreBtn}
              onPress={() => setShowInviteModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <Text style={styles.inviteMoreText}>{t('groupRun.inviteMore')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {(myStatus === 'accepted' || myStatus === 'completed') && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRunCourse} activeOpacity={0.7}>
              <Ionicons name="play" size={18} color={colors.white} />
              <Text style={styles.primaryBtnText}>{t('course.detail.runCourse')}</Text>
            </TouchableOpacity>
          )}

          {myStatus === 'invited' && (
            <View style={styles.inviteActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAccept} activeOpacity={0.7}>
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.primaryBtnText}>{t('groupRun.accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDecline} activeOpacity={0.7}>
                <Text style={styles.secondaryBtnText}>{t('groupRun.decline')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {(myStatus === 'accepted' || myStatus === 'completed') && !isCreator && (
            <TouchableOpacity style={styles.dangerBtn} onPress={handleLeave} activeOpacity={0.7}>
              <Ionicons name="exit-outline" size={16} color={colors.error} />
              <Text style={styles.dangerBtnText}>{t('groupRun.leave')}</Text>
            </TouchableOpacity>
          )}

          {isCreator && (
            <TouchableOpacity style={styles.dangerBtn} onPress={handleDisband} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.dangerBtnText}>{t('groupRun.disband')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Invite Modal — iOS: native Modal, Android: absolute overlay */}
      {IS_ANDROID ? (
        androidInviteModalMounted && (
          <View style={styles.androidOverlay}>
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => { setShowInviteModal(false); setInvitedUsers([]); setInviteCode(''); }} activeOpacity={0.7}>
                  <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{t('groupRun.inviteMore')}</Text>
                <TouchableOpacity
                  onPress={handleSubmitInvite}
                  disabled={isInviting || invitedUsers.length === 0}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalSave, (isInviting || invitedUsers.length === 0) && { opacity: 0.4 }]}>
                    {isInviting ? t('common.saving') : t('common.save')}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                <Text style={styles.modalLabel}>{t('groupRun.inviteByCode')}</Text>
                <View style={styles.inviteRow}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    placeholder={t('groupRun.codePlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    maxLength={20}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.inviteAddBtn} onPress={handleAddInvitee} activeOpacity={0.7}>
                    <Ionicons name="add" size={20} color={colors.white} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inviteHint}>
                  {`${(groupRun?.member_count ?? 0) + invitedUsers.length}/5 ${t('groupRun.members')}`}
                </Text>

                {invitedUsers.map((user) => (
                  <View key={user.id} style={styles.invitedUserRow}>
                    <View style={styles.invitedUserAvatar}>
                      <Ionicons name="person" size={14} color={colors.textTertiary} />
                    </View>
                    <Text style={styles.invitedUserName}>{user.nickname}</Text>
                    <TouchableOpacity onPress={() => setInvitedUsers((prev) => prev.filter((u) => u.id !== user.id))} activeOpacity={0.7}>
                      <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </SafeAreaView>
          </View>
        )
      ) : (
        <Modal visible={showInviteModal} animationType="slide">
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setShowInviteModal(false); setInvitedUsers([]); setInviteCode(''); }} activeOpacity={0.7}>
                <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t('groupRun.inviteMore')}</Text>
              <TouchableOpacity
                onPress={handleSubmitInvite}
                disabled={isInviting || invitedUsers.length === 0}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalSave, (isInviting || invitedUsers.length === 0) && { opacity: 0.4 }]}>
                  {isInviting ? t('common.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
              <Text style={styles.modalLabel}>{t('groupRun.inviteByCode')}</Text>
              <View style={styles.inviteRow}>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder={t('groupRun.codePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={20}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.inviteAddBtn} onPress={handleAddInvitee} activeOpacity={0.7}>
                  <Ionicons name="add" size={20} color={colors.white} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inviteHint}>
                {`${(groupRun?.member_count ?? 0) + invitedUsers.length}/5 ${t('groupRun.members')}`}
              </Text>

              {invitedUsers.map((user) => (
                <View key={user.id} style={styles.invitedUserRow}>
                  <View style={styles.invitedUserAvatar}>
                    <Ionicons name="person" size={14} color={colors.textTertiary} />
                  </View>
                  <Text style={styles.invitedUserName}>{user.nickname}</Text>
                  <TouchableOpacity onPress={() => setInvitedUsers((prev) => prev.filter((u) => u.id !== user.id))} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ---- Sub-component ----

const MemberRow = React.memo(function MemberRow({
  member,
  index,
  isMe,
  isCompleted,
}: {
  member: GroupRunMemberInfo;
  index: number;
  isMe: boolean;
  isCompleted: boolean;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const statusColors: Record<string, string> = {
    invited: colors.warning,
    accepted: colors.primary,
    completed: colors.success,
  };

  return (
    <View style={[styles.memberRow, isMe && styles.memberRowMe]}>
      {isCompleted && (
        <Text style={styles.memberRank}>#{index + 1}</Text>
      )}
      {!isCompleted && <View style={{ width: 24 }} />}

      {member.avatar_url ? (
        <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
      ) : (
        <View style={[styles.memberAvatar, styles.memberAvatarPlaceholder]}>
          <Ionicons name="person" size={14} color={colors.textTertiary} />
        </View>
      )}

      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, isMe && { color: colors.primary, fontWeight: '800' }]}>
          {member.nickname || '...'}
          {isMe ? ' (ME)' : ''}
        </Text>
        <View style={[styles.memberStatusBadge, { backgroundColor: (statusColors[member.status] || colors.textTertiary) + '20' }]}>
          <Text style={[styles.memberStatusText, { color: statusColors[member.status] || colors.textTertiary }]}>
            {t(`groupRun.${member.status}`)}
          </Text>
        </View>
      </View>

      {isCompleted && member.best_duration_seconds != null && (
        <View style={styles.memberStats}>
          <Text style={styles.memberTime}>{formatDuration(member.best_duration_seconds)}</Text>
          {member.best_pace_seconds_per_km != null && (
            <Text style={styles.memberPace}>{formatPace(member.best_pace_seconds_per_km)}</Text>
          )}
        </View>
      )}
    </View>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: SPACING.xxl,
    paddingBottom: 100,
    gap: SPACING.xl,
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

  // Course Card
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  courseCardName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  courseCardSub: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginTop: 2,
  },

  // Ranking Card
  rankingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: c.primary + '10',
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.lg,
  },
  rankingCardRank: {
    fontSize: 32,
    fontWeight: '900',
    color: c.primary,
  },
  rankingCardTime: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: c.text,
  },
  rankingCardLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    marginTop: 2,
  },
  rankingCardPending: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: c.surfaceLight,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  rankingCardPendingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },
  rankingCardPendingSub: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
  },

  // Members Section
  membersSection: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: c.text,
    marginBottom: SPACING.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    gap: SPACING.md,
  },
  memberRowMe: {
    backgroundColor: c.primary + '0D',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    marginHorizontal: -SPACING.sm,
  },
  memberRank: {
    width: 24,
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: c.textSecondary,
    textAlign: 'center',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  memberAvatarPlaceholder: {
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  memberStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
  },
  memberStatusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  memberStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  memberTime: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  memberPace: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontVariant: ['tabular-nums'],
  },

  // Actions
  actionsSection: {
    gap: SPACING.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  primaryBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceLight,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
  },
  secondaryBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  inviteActions: {
    gap: SPACING.sm,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  dangerBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.error,
  },

  // Invite more button
  inviteMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  inviteMoreText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.primary,
  },

  // Android overlay (replaces native Modal)
  androidOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: c.background,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: c.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  modalCancel: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
  },
  modalTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  modalSave: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.primary,
  },
  modalBody: {
    flex: 1,
    padding: SPACING.xxl,
  },
  modalLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.text,
    marginBottom: SPACING.sm,
  },
  modalInput: {
    fontSize: FONT_SIZES.md,
    color: c.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  inviteAddBtn: {
    width: 44,
    height: 44,
    backgroundColor: c.primary,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteHint: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  invitedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  invitedUserAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitedUserName: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
});
