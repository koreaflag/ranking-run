import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewItem, CrewManagementStats, CrewJoinRequestItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { getGradeName, getGradeColor } from '../../utils/crewGrade';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewManage'>;
type Route = RouteProp<HomeStackParamList, 'CrewManage'>;

export default function CrewManageScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { crewId } = route.params;

  const [crew, setCrew] = useState<CrewItem | null>(null);
  const [stats, setStats] = useState<CrewManagementStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<CrewJoinRequestItem[]>([]);

  // Grade name editing
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [gradeNames, setGradeNames] = useState<Record<string, string>>({
    '1': '',
    '2': '',
    '3': '',
    '4': '',
  });
  const [isSavingGrades, setIsSavingGrades] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const isOwner = crew?.my_role === 'owner';

  const loadData = useCallback(async () => {
    try {
      const [crewData, statsData] = await Promise.all([
        crewService.getCrew(crewId),
        crewService.getManagementStats(crewId),
      ]);
      setCrew(crewData);
      setStats(statsData);

      // Init grade names from config
      const cfg = crewData.grade_config?.levels;
      setGradeNames({
        '1': cfg?.['1']?.name ?? '',
        '2': cfg?.['2']?.name ?? '',
        '3': cfg?.['3']?.name ?? '',
        '4': cfg?.['4']?.name ?? '',
      });

      // Load pending requests
      if (crewData.my_role === 'owner' || crewData.my_role === 'admin') {
        try {
          const reqs = await crewService.getPendingRequests(crewId, { per_page: 20 });
          setPendingRequests(reqs.data);
        } catch { /* ignore */ }
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [crewId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveGradeNames = useCallback(async () => {
    if (!crew) return;
    setIsSavingGrades(true);
    try {
      const levels: Record<string, { name: string }> = {};
      for (const lvl of ['1', '2', '3', '4']) {
        const name = gradeNames[lvl]?.trim();
        if (name) {
          levels[lvl] = { name };
        }
      }
      await crewService.updateCrew(crewId, { grade_config: { levels } } as any);
      setShowGradeModal(false);
      Alert.alert(t('crew.gradeNameSaved'));
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.gradeNameSaveFailed'));
    } finally {
      setIsSavingGrades(false);
    }
  }, [crew, crewId, gradeNames, loadData, t]);

  const handleApprove = useCallback(async (requestId: string) => {
    try {
      await crewService.approveRequest(crewId, requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    }
  }, [crewId, loadData, t]);

  const handleReject = useCallback(async (requestId: string) => {
    try {
      await crewService.rejectRequest(crewId, requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    }
  }, [crewId, t]);

  const handleInvite = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setIsInviting(true);
    try {
      await crewService.inviteByCode(crewId, code);
      setShowInvite(false);
      setInviteCode('');
      Alert.alert(t('crew.invite'), t('common.success'));
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.inviteFailed'));
    } finally {
      setIsInviting(false);
    }
  }, [inviteCode, crewId, loadData, t]);

  const handleDisband = useCallback(() => {
    Alert.alert(
      t('crew.disbandTitle'),
      t('crew.disbandMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crew.disband'),
          style: 'destructive',
          onPress: async () => {
            try {
              await crewService.deleteCrew(crewId);
              navigation.goBack();
              navigation.goBack();
            } catch {
              Alert.alert(t('common.errorTitle'), t('crew.disbandFailed'));
            }
          },
        },
      ],
    );
  }, [crewId, navigation, t]);

  if (isLoading) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.manage')}</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  if (!crew) return null;

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('crew.manage')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Crew Overview */}
          <View style={styles.overviewCard}>
            <View style={styles.overviewRow}>
              {crew.logo_url ? (
                <Image source={{ uri: crew.logo_url }} style={styles.crewLogo} />
              ) : (
                <View style={[styles.crewLogo, styles.crewLogoPlaceholder]}>
                  <Ionicons name="people" size={24} color={colors.textTertiary} />
                </View>
              )}
              <View style={styles.overviewInfo}>
                <Text style={styles.crewName}>{crew.name}</Text>
                <Text style={styles.memberCountText}>
                  {t('crew.memberCount', { count: crew.member_count })}
                </Text>
              </View>
            </View>

            {/* Quick Stats */}
            {stats && (
              <View style={styles.quickStats}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{stats.total_members}</Text>
                  <Text style={styles.statLabel}>{t('crew.membersCount')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, stats.pending_requests > 0 && { color: colors.error }]}>
                    {stats.pending_requests}
                  </Text>
                  <Text style={styles.statLabel}>{t('crew.pendingCount')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: colors.success }]}>
                    +{stats.recent_joins_7d}
                  </Text>
                  <Text style={styles.statLabel}>{t('crew.thisWeek')}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Info Management Section */}
          <Text style={styles.sectionTitle}>{t('crew.manageInfo')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate('CrewEdit', { crewId })}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>{t('crew.editInfo')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
            {isOwner && (
              <>
                <View style={styles.menuDivider} />
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => setShowGradeModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ribbon-outline" size={20} color={colors.text} />
                  <Text style={styles.menuText}>{t('crew.gradeNameConfig')}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Member Management Section */}
          <Text style={styles.sectionTitle}>{t('crew.manageMembers')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate('CrewMembers', { crewId })}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>{t('crew.allMembers')}</Text>
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{stats?.total_members ?? 0}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.7}
              onPress={() => {/* Toggle inline pending requests */}}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>{t('crew.pendingRequests')}</Text>
              {(stats?.pending_requests ?? 0) > 0 && (
                <View style={[styles.menuBadge, { backgroundColor: colors.error }]}>
                  <Text style={[styles.menuBadgeText, { color: colors.white }]}>
                    {stats?.pending_requests}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setShowInvite(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={20} color={colors.text} />
              <Text style={styles.menuText}>{t('crew.inviteMember')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Pending Requests Inline */}
          {pendingRequests.length > 0 && (
            <View style={styles.pendingCard}>
              {pendingRequests.map((req) => (
                <View key={req.id} style={styles.pendingRow}>
                  <View style={styles.pendingUserInfo}>
                    {req.user.avatar_url ? (
                      <Image source={{ uri: req.user.avatar_url }} style={styles.pendingAvatar} />
                    ) : (
                      <View style={[styles.pendingAvatar, styles.pendingAvatarPlaceholder]}>
                        <Ionicons name="person" size={14} color={colors.textTertiary} />
                      </View>
                    )}
                    <View>
                      <Text style={styles.pendingNickname}>{req.user.nickname ?? '?'}</Text>
                      {req.message && (
                        <Text style={styles.pendingMessage} numberOfLines={1}>{req.message}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleApprove(req.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.approveBtnText}>{t('crew.approve')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(req.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.rejectBtnText}>{t('crew.reject')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Grade Overview Section */}
          <Text style={styles.sectionTitle}>{t('crew.manageGrades')}</Text>
          <View style={styles.gradeCard}>
            {[5, 4, 3, 2, 1].map((level) => {
              const count = stats?.members_by_grade?.[level] ?? 0;
              const gradeName = getGradeName(level, crew.grade_config, t);
              const gradeColor = getGradeColor(level, colors);
              return (
                <View key={level} style={[styles.gradeRow, level < 5 && styles.gradeRowBorder]}>
                  <View style={[styles.gradeLevelBadge, { backgroundColor: gradeColor + '20' }]}>
                    <Text style={[styles.gradeLevelText, { color: gradeColor }]}>
                      Lv.{level}
                    </Text>
                  </View>
                  <Text style={styles.gradeNameText}>{gradeName}</Text>
                  <Text style={styles.gradeCountText}>{count}명</Text>
                </View>
              );
            })}
          </View>

          {/* Danger Zone */}
          {isOwner && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.error }]}>
                {t('crew.dangerZone')}
              </Text>
              <View style={styles.menuCard}>
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={handleDisband}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={[styles.menuText, { color: colors.error }]}>{t('crew.disband')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Grade Name Config Modal */}
        <Modal visible={showGradeModal} animationType="slide">
          <BlurredBackground>
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowGradeModal(false)} activeOpacity={0.7}>
                  <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{t('crew.gradeNameConfig')}</Text>
                <TouchableOpacity onPress={handleSaveGradeNames} disabled={isSavingGrades} activeOpacity={0.7}>
                  <Text style={[styles.modalSave, isSavingGrades && { opacity: 0.4 }]}>
                    {isSavingGrades ? t('common.saving') : t('common.save')}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Level 5 - owner (fixed) */}
                <View style={styles.gradeEditRow}>
                  <View style={[styles.gradeLevelBadge, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.gradeLevelText, { color: colors.primary }]}>Lv.5</Text>
                  </View>
                  <TextInput
                    style={[styles.gradeInput, { color: colors.textTertiary }]}
                    value={t('crew.gradeOwner')}
                    editable={false}
                  />
                </View>

                {/* Levels 4-1 - editable (high to low) */}
                {[4, 3, 2, 1].map((level) => {
                  const defaultName = getGradeName(level, null, t);
                  const gradeColor = getGradeColor(level, colors);
                  return (
                    <View key={level} style={styles.gradeEditRow}>
                      <View style={[styles.gradeLevelBadge, { backgroundColor: gradeColor + '20' }]}>
                        <Text style={[styles.gradeLevelText, { color: gradeColor }]}>
                          Lv.{level}
                        </Text>
                      </View>
                      <TextInput
                        style={styles.gradeInput}
                        value={gradeNames[String(level)]}
                        onChangeText={(v) =>
                          setGradeNames(prev => ({ ...prev, [String(level)]: v }))
                        }
                        placeholder={defaultName}
                        placeholderTextColor={colors.textTertiary}
                        maxLength={20}
                      />
                    </View>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          </BlurredBackground>
        </Modal>

        {/* Invite Modal */}
        <Modal visible={showInvite} animationType="fade" transparent>
          <View style={styles.inviteOverlay}>
            <View style={styles.inviteCard}>
              <Text style={styles.inviteTitle}>{t('crew.inviteTitle')}</Text>
              <Text style={styles.inviteDesc}>{t('crew.inviteDesc')}</Text>
              <TextInput
                style={styles.inviteInput}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder={t('crew.inviteCodePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={styles.inviteCancelBtn}
                  onPress={() => { setShowInvite(false); setInviteCode(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.inviteCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inviteConfirmBtn, !inviteCode.trim() && { opacity: 0.5 }]}
                  onPress={handleInvite}
                  disabled={!inviteCode.trim() || isInviting}
                  activeOpacity={0.7}
                >
                  {isInviting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.inviteConfirmText}>{t('crew.invite')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: SPACING.sm },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    marginRight: 32,
  },
  headerSpacer: { width: 32 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },

  // Overview
  overviewCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: c.border,
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  crewLogo: { width: 56, height: 56, borderRadius: 28 },
  crewLogoPlaceholder: {
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewInfo: { flex: 1, gap: 2 },
  crewName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
  },
  memberCountText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, backgroundColor: c.divider },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // Section Title
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textSecondary,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xs,
    paddingLeft: SPACING.xs,
  },

  // Menu Card
  menuCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginHorizontal: SPACING.lg,
  },
  menuBadge: {
    backgroundColor: c.surfaceLight,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginRight: SPACING.xs,
  },
  menuBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: c.textSecondary,
  },

  // Pending Requests
  pendingCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  pendingAvatar: { width: 36, height: 36, borderRadius: 18 },
  pendingAvatarPlaceholder: {
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingNickname: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  pendingMessage: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    marginTop: 1,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  approveBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  approveBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.white,
  },
  rejectBtn: {
    backgroundColor: c.surfaceLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  rejectBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },

  // Grade Overview
  gradeCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: SPACING.lg,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  gradeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  gradeLevelBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  gradeLevelText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  gradeNameText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  gradeCountText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Grade Name Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  modalCancel: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
  },
  modalSave: {
    fontSize: FONT_SIZES.md,
    color: c.primary,
    fontWeight: '700',
  },
  modalBody: { padding: SPACING.xl },
  gradeEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  gradeInput: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },

  // Invite Modal
  inviteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  inviteCard: {
    width: '100%',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    gap: SPACING.md,
  },
  inviteTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
  },
  inviteDesc: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    textAlign: 'center',
  },
  inviteInput: {
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    fontSize: FONT_SIZES.md,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  inviteCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
  },
  inviteCancelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  inviteConfirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.primary,
    alignItems: 'center',
  },
  inviteConfirmText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
  },
});
