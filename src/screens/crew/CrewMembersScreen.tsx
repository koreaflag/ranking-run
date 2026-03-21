import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewItem, CrewMemberItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { getGradeName, getGradeColor } from '../../utils/crewGrade';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewMembers'>;
type Route = RouteProp<HomeStackParamList, 'CrewMembers'>;

export default function CrewMembersScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { crewId } = route.params;
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [crew, setCrew] = useState<CrewItem | null>(null);
  const [members, setMembers] = useState<CrewMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [crewData, membersData] = await Promise.all([
        crewService.getCrew(crewId),
        crewService.getMembers(crewId, { per_page: 100 }),
      ]);
      setCrew(crewData);
      setMembers(membersData.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [crewId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isOwner = crew?.my_role === 'owner';
  const isAdmin = crew?.my_role === 'admin';
  const canManage = isOwner || isAdmin;

  const handleInvite = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setIsInviting(true);
    try {
      await crewService.inviteByCode(crewId, code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowInvite(false);
      setInviteCode('');
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.inviteFailed'));
    } finally {
      setIsInviting(false);
    }
  }, [inviteCode, crewId, loadData, t]);

  const showGradeSelection = useCallback(
    (member: CrewMemberItem) => {
      const myLevel = crew?.my_role === 'owner' ? 5 : 4;
      const currentLevel = member.grade_level ?? (member.role === 'owner' ? 5 : member.role === 'admin' ? 4 : 1);

      const gradeOptions: string[] = [];
      const gradeLevels: number[] = [];

      for (let lvl = 1; lvl <= 4; lvl++) {
        if (lvl < myLevel && lvl !== currentLevel) {
          gradeOptions.push(getGradeName(lvl, crew?.grade_config, t));
          gradeLevels.push(lvl);
        }
      }
      gradeOptions.push(t('common.cancel'));

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: gradeOptions,
            cancelButtonIndex: gradeOptions.length - 1,
          },
          (idx) => {
            if (idx < gradeLevels.length) {
              crewService
                .updateMemberGrade(crewId, member.user_id, gradeLevels[idx])
                .then(() => loadData())
                .catch(() => Alert.alert(t('common.errorTitle'), t('crew.gradeChangeFailed')));
            }
          },
        );
      } else {
        Alert.alert(t('crew.selectGrade'), undefined, [
          ...gradeLevels.map((lvl, i) => ({
            text: gradeOptions[i],
            onPress: async () => {
              try {
                await crewService.updateMemberGrade(crewId, member.user_id, lvl);
                await loadData();
              } catch {
                Alert.alert(t('common.errorTitle'), t('crew.gradeChangeFailed'));
              }
            },
          })),
          { text: t('common.cancel'), style: 'cancel' as const },
        ]);
      }
    },
    [crew, crewId, loadData, t],
  );

  const handleMemberAction = useCallback(
    (member: CrewMemberItem) => {
      if (!canManage || member.role === 'owner') return;

      // Admin cannot manage other admins
      if (isAdmin && member.role === 'admin') return;

      const options: string[] = [];
      const actions: (() => void)[] = [];

      const myLevel = crew?.my_role === 'owner' ? 5 : 4;
      const targetLevel = member.grade_level ?? (member.role === 'owner' ? 5 : member.role === 'admin' ? 4 : 1);

      // Grade change — higher level can manage lower level
      if (isOwner || (isAdmin && myLevel > targetLevel)) {
        options.push(t('crew.changeGrade'));
        actions.push(() => showGradeSelection(member));
      }

      // Kick
      options.push(t('crew.kickMember'));
      actions.push(() => {
        Alert.alert(
          t('crew.kickConfirmTitle'),
          t('crew.kickConfirmMsg', { name: member.nickname ?? '?' }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('crew.kick'),
              style: 'destructive',
              onPress: async () => {
                try {
                  await crewService.kickMember(crewId, member.user_id);
                  await loadData();
                } catch {
                  Alert.alert(t('common.errorTitle'), t('crew.kickFailed'));
                }
              },
            },
          ],
        );
      });

      options.push(t('common.cancel'));

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: options.length - 2, // kick
            cancelButtonIndex: options.length - 1,
          },
          (idx) => {
            if (idx < actions.length) {
              actions[idx]();
            }
          },
        );
      } else {
        // Simple alert for Android
        Alert.alert(
          member.nickname ?? '?',
          undefined,
          [
            ...actions.map((action, idx) => ({
              text: options[idx],
              onPress: action,
              style: idx === actions.length - 1 ? ('destructive' as const) : ('default' as const),
            })),
            { text: t('common.cancel'), style: 'cancel' },
          ],
        );
      }
    },
    [canManage, isOwner, isAdmin, crew, crewId, loadData, t, showGradeSelection],
  );

  const renderMember = useCallback(
    ({ item }: { item: CrewMemberItem }) => {
      const initial = (item.nickname ?? '?').charAt(0).toUpperCase();
      const gradeLevel = item.grade_level ?? (item.role === 'owner' ? 5 : item.role === 'admin' ? 4 : 1);
      const gradeName = getGradeName(gradeLevel, crew?.grade_config, t);
      const gradeColor = getGradeColor(gradeLevel, colors);

      const showAction = canManage && item.role !== 'owner' && !(isAdmin && item.role === 'admin');

      return (
        <View style={styles.memberRow}>
          <TouchableOpacity
            style={styles.memberMain}
            onPress={() => navigation.navigate('UserProfile', { userId: item.user_id })}
            activeOpacity={0.7}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.memberAvatarImg} />
            ) : (
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{initial}</Text>
              </View>
            )}
            <View style={styles.memberInfo}>
              <Text style={styles.memberNickname}>
                {item.nickname ?? t('crew.unknown')}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: gradeColor + '20' }]}>
                <Text style={[styles.roleBadgeText, { color: gradeColor }]}>
                  {gradeName}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          {showAction && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleMemberAction(item)}
              activeOpacity={0.6}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [canManage, isAdmin, crew, styles, colors, navigation, handleMemberAction, t],
  );

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('crew.members')}</Text>
          {canManage ? (
            <TouchableOpacity
              style={styles.inviteHeaderBtn}
              onPress={() => setShowInvite(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.user_id}
            renderItem={renderMember}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Invite Modal */}
        <Modal
          visible={showInvite}
          transparent
          animationType="fade"
          onRequestClose={() => setShowInvite(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowInvite(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
                <Text style={styles.modalTitle}>{t('crew.inviteTitle')}</Text>
                <Text style={styles.modalDesc}>{t('crew.inviteDesc')}</Text>

                <View style={styles.modalInputRow}>
                  <TextInput
                    style={styles.modalInput}
                    placeholder={t('crew.inviteCodePlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleInvite}
                  />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowInvite(false); setInviteCode(''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalInviteBtn,
                      (!inviteCode.trim() || isInviting) && styles.modalInviteBtnDisabled,
                    ]}
                    onPress={handleInvite}
                    disabled={!inviteCode.trim() || isInviting}
                    activeOpacity={0.7}
                  >
                    {isInviting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalInviteText}>{t('crew.invite')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    headerSpacer: { width: 40 },
    inviteHeaderBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // List
    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 100,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    memberMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    memberAvatarImg: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    memberAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.textSecondary,
    },
    memberInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    memberNickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    roleBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
    },
    roleBadgeOwner: {
      backgroundColor: c.primary + '20',
    },
    roleBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textSecondary,
    },
    roleBadgeTextOwner: {
      color: c.primary,
    },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Invite modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '85%',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xxl,
      gap: SPACING.lg,
    },
    modalTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    modalDesc: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    modalInputRow: {
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalInput: {
      fontSize: FONT_SIZES.md,
      color: c.text,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.lg,
      textAlign: 'center',
    },
    modalActions: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.sm,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.surface,
      alignItems: 'center',
    },
    modalCancelText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textSecondary,
    },
    modalInviteBtn: {
      flex: 1,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    modalInviteBtnDisabled: {
      opacity: 0.4,
    },
    modalInviteText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
