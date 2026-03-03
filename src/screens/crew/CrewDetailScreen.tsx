import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewItem, CrewMemberItem, CrewJoinRequestItem, CommunityPostItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { communityService } from '../../services/communityService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewDetail'>;
type Route = RouteProp<HomeStackParamList, 'CrewDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const COVER_HEIGHT = 180;
const MEMBER_PREVIEW_LIMIT = 5;

export default function CrewDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { crewId } = route.params;
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [crew, setCrew] = useState<CrewItem | null>(null);
  const [members, setMembers] = useState<CrewMemberItem[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<CrewJoinRequestItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentPosts, setRecentPosts] = useState<CommunityPostItem[]>([]);

  const canEdit = crew?.my_role === 'owner' || crew?.my_role === 'admin';

  const loadData = useCallback(async () => {
    try {
      const [crewData, membersData] = await Promise.all([
        crewService.getCrew(crewId),
        crewService.getMembers(crewId, { per_page: MEMBER_PREVIEW_LIMIT }),
      ]);
      setCrew(crewData);
      setMembers(membersData.data);
      setMembersTotal(membersData.total_count);

      // Load recent posts for members
      if (crewData.is_member) {
        try {
          const postsData = await communityService.getPosts({ crew_id: crewId, per_page: 3 });
          setRecentPosts(postsData.data);
        } catch {
          // ignore
        }
      }

      // Load pending join requests for admin/owner
      const role = crewData.my_role;
      if (role === 'owner' || role === 'admin') {
        try {
          const reqData = await crewService.getPendingRequests(crewId, { per_page: 10 });
          setPendingRequests(reqData.data);
          setPendingCount(reqData.total_count);
        } catch {
          // ignore - user may not have access
        }
      }
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [crewId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when returning from edit screen
  useFocusEffect(
    useCallback(() => {
      if (!isLoading) loadData();
    }, [loadData, isLoading]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleJoin = useCallback(async () => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      if (crew?.requires_approval) {
        await crewService.requestJoin(crewId);
        // Refresh crew to get updated join_request_status
        const updated = await crewService.getCrew(crewId);
        setCrew(updated);
        Alert.alert(t('crew.requestSent'), t('crew.requestSentMsg'));
      } else {
        const updated = await crewService.joinCrew(crewId);
        setCrew(updated);
        const membersData = await crewService.getMembers(crewId, { per_page: MEMBER_PREVIEW_LIMIT });
        setMembers(membersData.data);
        setMembersTotal(membersData.total_count);
      }
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.joinFailed'));
    } finally {
      setIsJoining(false);
    }
  }, [crewId, isJoining, t, crew?.requires_approval]);

  const handleCancelRequest = useCallback(async () => {
    if (!crew?.join_request_status) return;
    try {
      const myReq = await crewService.getMyJoinRequest(crewId);
      if (myReq.request_id) {
        await crewService.cancelRequest(crewId, myReq.request_id);
        const updated = await crewService.getCrew(crewId);
        setCrew(updated);
      }
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    }
  }, [crewId, crew?.join_request_status, t]);

  const handleApproveRequest = useCallback(async (requestId: string) => {
    try {
      await crewService.approveRequest(crewId, requestId);
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    }
  }, [crewId, loadData, t]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    try {
      await crewService.rejectRequest(crewId, requestId);
      await loadData();
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    }
  }, [crewId, loadData, t]);

  const handleLeave = useCallback(async () => {
    Alert.alert(
      t('crew.leaveTitle'),
      t('crew.leaveMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crew.leave'),
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await crewService.leaveCrew(crewId);
              await loadData();
            } catch {
              Alert.alert(t('common.errorTitle'), t('crew.leaveFailed'));
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ],
    );
  }, [crewId, loadData, t]);

  const handleOpenBoard = useCallback(() => {
    if (!crew) return;
    navigation.navigate('CrewBoard', { crewId, crewName: crew.name });
  }, [navigation, crewId, crew]);

  const handleViewAllMembers = useCallback(() => {
    navigation.navigate('CrewMembers', { crewId });
  }, [navigation, crewId]);

  const handleEdit = useCallback(() => {
    navigation.navigate('CrewEdit', { crewId });
  }, [navigation, crewId]);

  // Loading state
  if (isLoading) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.crew')}</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  // Not found
  if (!crew) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.crew')}</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.loadingContainer}>
            <Text style={styles.emptyText}>{t('crew.crewNotFound')}</Text>
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  const hasCover = !!crew.cover_image_url;
  const hasLogo = !!crew.logo_url;

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {crew.name}
          </Text>
          <View style={styles.headerRight}>
            {crew?.is_member && (
              <TouchableOpacity
                onPress={handleViewAllMembers}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="people-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity
                onPress={handleEdit}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            )}
            {!crew?.is_member && !canEdit && <View style={styles.headerSpacer} />}
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Cover Image */}
          {hasCover ? (
            <Image source={{ uri: crew.cover_image_url! }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: (crew.badge_color || colors.primary) + '25' }]}>
              <Ionicons name="image-outline" size={32} color={(crew.badge_color || colors.primary) + '60'} />
            </View>
          )}

          {/* Logo/Badge overlapping cover */}
          <View style={styles.logoSection}>
            {hasLogo ? (
              <Image source={{ uri: crew.logo_url! }} style={styles.logoImage} />
            ) : (
              <View style={[styles.logoBadge, { backgroundColor: crew.badge_color || colors.primary }]}>
                <Ionicons
                  name={(crew.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
                  size={32}
                  color="#FFFFFF"
                />
              </View>
            )}
          </View>

          <View style={styles.contentContainer}>
            {/* Crew Name & Description */}
            <View style={styles.profileSection}>
              <Text style={styles.crewName}>{crew.name}</Text>
              {crew.description ? (
                <Text style={styles.crewDescription}>{crew.description}</Text>
              ) : null}
            </View>

            {/* Info Pills */}
            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Ionicons name="people" size={14} color={colors.primary} />
                <Text style={styles.pillText}>
                  {crew.member_count}{crew.max_members ? `/${crew.max_members}` : ''} {t('crew.members')}
                </Text>
              </View>
              {crew.recurring_schedule ? (
                <View style={styles.pill}>
                  <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.pillText}>{crew.recurring_schedule}</Text>
                </View>
              ) : null}
              {crew.meeting_point ? (
                <View style={styles.pill}>
                  <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.pillText}>{crew.meeting_point}</Text>
                </View>
              ) : null}
            </View>

            {/* Owner */}
            {crew.owner.nickname ? (
              <View style={styles.ownerRow}>
                {crew.owner.avatar_url ? (
                  <Image source={{ uri: crew.owner.avatar_url }} style={styles.ownerAvatarImg} />
                ) : (
                  <View style={styles.ownerAvatar}>
                    <Text style={styles.ownerAvatarText}>
                      {crew.owner.nickname.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.ownerInfo}>
                  <Text style={styles.ownerLabel}>{t('crew.roleOwner')}</Text>
                  <Text style={styles.ownerName}>{crew.owner.nickname}</Text>
                </View>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={styles.actionSection}>
              {crew.is_member ? (
                <View style={styles.memberActions}>
                  {crew.my_role !== 'owner' && (
                    <TouchableOpacity
                      style={styles.leaveButton}
                      onPress={handleLeave}
                      disabled={isLeaving}
                      activeOpacity={0.7}
                    >
                      {isLeaving ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Text style={styles.leaveButtonText}>{t('crew.leave')}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ) : crew.join_request_status === 'pending' ? (
                <TouchableOpacity
                  style={styles.pendingButton}
                  onPress={handleCancelRequest}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
                  <Text style={styles.pendingButtonText}>{t('crew.pending')}</Text>
                  <Text style={styles.pendingCancelHint}>{t('crew.tapToCancel')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={handleJoin}
                  disabled={isJoining}
                  activeOpacity={0.7}
                >
                  {isJoining ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.joinButtonText}>
                        {crew.requires_approval ? t('crew.requestJoin') : t('crew.joinBtn')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Pending Join Requests (admin/owner) */}
            {canEdit && pendingCount > 0 && (
              <View style={styles.requestsSection}>
                <View style={styles.membersSectionHeader}>
                  <Text style={styles.membersSectionTitle}>{t('crew.pendingRequests')}</Text>
                  <View style={styles.requestCountBadge}>
                    <Text style={styles.requestCountText}>{pendingCount}</Text>
                  </View>
                </View>
                <View style={styles.membersList}>
                  {pendingRequests.map((req, idx) => {
                    const initial = (req.user.nickname ?? '?').charAt(0).toUpperCase();
                    return (
                      <View
                        key={req.id}
                        style={[
                          styles.requestRow,
                          idx === pendingRequests.length - 1 && styles.memberRowLast,
                        ]}
                      >
                        {req.user.avatar_url ? (
                          <Image source={{ uri: req.user.avatar_url }} style={styles.memberAvatarImg} />
                        ) : (
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>{initial}</Text>
                          </View>
                        )}
                        <View style={styles.requestInfo}>
                          <Text style={styles.memberNickname}>{req.user.nickname ?? '?'}</Text>
                          {req.message ? (
                            <Text style={styles.requestMessage} numberOfLines={1}>{req.message}</Text>
                          ) : null}
                        </View>
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleApproveRequest(req.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.approveBtnText}>{t('crew.approve')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleRejectRequest(req.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.rejectBtnText}>{t('crew.reject')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Recent Posts (members only) */}
            {crew.is_member && (
              <View style={styles.postsSection}>
                <View style={styles.postsSectionHeader}>
                  <Text style={styles.postsSectionTitle}>{t('social.crewBoard')}</Text>
                  <TouchableOpacity
                    style={styles.writePostBtn}
                    onPress={() => navigation.navigate('CommunityPostCreate', { crewId })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={styles.writePostText}>{t('social.writePost')}</Text>
                  </TouchableOpacity>
                </View>
                {recentPosts.length > 0 ? (
                  <View style={styles.postsList}>
                    {recentPosts.map((post, idx) => (
                      <TouchableOpacity
                        key={post.id}
                        style={[styles.postRow, idx === recentPosts.length - 1 && styles.postRowLast]}
                        onPress={() => navigation.navigate('CommunityPostDetail', { postId: post.id })}
                        activeOpacity={0.7}
                      >
                        <View style={styles.postContent}>
                          <Text style={styles.postTitle} numberOfLines={1}>{post.title}</Text>
                          <Text style={styles.postMeta}>
                            {post.author.nickname} · {new Date(post.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.postStats}>
                          {post.comment_count > 0 && (
                            <View style={styles.postStatItem}>
                              <Ionicons name="chatbubble-outline" size={12} color={colors.textTertiary} />
                              <Text style={styles.postStatText}>{post.comment_count}</Text>
                            </View>
                          )}
                          {post.like_count > 0 && (
                            <View style={styles.postStatItem}>
                              <Ionicons name="heart-outline" size={12} color={colors.textTertiary} />
                              <Text style={styles.postStatText}>{post.like_count}</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyPosts}>
                    <Text style={styles.emptyPostsText}>{t('social.noPosts')}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.viewAllButton}
                  onPress={handleOpenBoard}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllText}>{t('social.viewAllPosts')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Members Preview */}
            <View style={styles.membersSection}>
              <TouchableOpacity
                style={styles.membersSectionHeader}
                onPress={handleViewAllMembers}
                activeOpacity={0.7}
              >
                <Text style={styles.membersSectionTitle}>{t('crew.members')}</Text>
                <Text style={styles.membersSectionCount}>{membersTotal}</Text>
                <View style={{ flex: 1 }} />
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              {members.length > 0 ? (
                <View style={styles.membersAvatarRow}>
                  {members.map((member) => (
                    <TouchableOpacity
                      key={member.user_id}
                      onPress={() => navigation.navigate('UserProfile', { userId: member.user_id })}
                      activeOpacity={0.7}
                    >
                      {member.avatar_url ? (
                        <Image source={{ uri: member.avatar_url }} style={styles.memberAvatarImg} />
                      ) : (
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {(member.nickname ?? '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                  {membersTotal > MEMBER_PREVIEW_LIMIT && (
                    <TouchableOpacity
                      style={styles.memberAvatarMore}
                      onPress={handleViewAllMembers}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.memberAvatarMoreText}>+{membersTotal - MEMBER_PREVIEW_LIMIT}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.emptyMembers}>
                  <Text style={styles.emptyMembersText}>{t('crew.noMembers')}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Sub-components ----

function MemberRow({
  member,
  isLast,
  onPress,
}: {
  member: CrewMemberItem;
  isLast: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initial = (member.nickname ?? '?').charAt(0).toUpperCase();
  const roleLabel =
    member.role === 'owner'
      ? t('crew.roleOwner')
      : member.role === 'admin'
        ? t('crew.roleAdmin')
        : null;

  return (
    <TouchableOpacity
      style={[styles.memberRow, isLast && styles.memberRowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {member.avatar_url ? (
        <Image source={{ uri: member.avatar_url }} style={styles.memberAvatarImg} />
      ) : (
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>{initial}</Text>
        </View>
      )}
      <View style={styles.memberInfo}>
        <Text style={styles.memberNickname}>{member.nickname ?? t('crew.unknown')}</Text>
        {roleLabel && (
          <View style={[styles.roleBadge, member.role === 'owner' && styles.roleBadgeOwner]}>
            <Text
              style={[styles.roleBadgeText, member.role === 'owner' && styles.roleBadgeTextOwner]}
            >
              {roleLabel}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    contentContainer: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 120,
      gap: SPACING.xl,
    },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Header
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
      letterSpacing: -0.3,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: SPACING.sm,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      minWidth: 24,
    },
    headerSpacer: { width: 24 },

    // Cover image
    coverImage: {
      width: SCREEN_WIDTH,
      height: COVER_HEIGHT,
    },
    coverPlaceholder: {
      width: SCREEN_WIDTH,
      height: COVER_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Logo
    logoSection: {
      alignItems: 'center',
      marginTop: -36,
      marginBottom: SPACING.sm,
      zIndex: 1,
    },
    logoImage: {
      width: 72,
      height: 72,
      borderRadius: 22,
      borderWidth: 3,
      borderColor: c.background,
    },
    logoBadge: {
      width: 72,
      height: 72,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: c.background,
    },

    // Profile section
    profileSection: {
      alignItems: 'center',
      gap: SPACING.sm,
    },
    crewName: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    crewDescription: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.textSecondary,
      lineHeight: 22,
      textAlign: 'center',
      paddingHorizontal: SPACING.lg,
    },

    // Info pills
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },

    // Owner
    ownerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    ownerAvatarImg: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    ownerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    ownerAvatarText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.primary,
    },
    ownerInfo: {
      flex: 1,
      gap: 1,
    },
    ownerLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },
    ownerName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },

    // Action Buttons
    actionSection: {},
    memberActions: {
      alignItems: 'flex-end',
    },
    leaveButton: {
      paddingHorizontal: SPACING.xxl,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.lg,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaveButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.error,
    },
    joinButton: {
      flexDirection: 'row',
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    joinButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    pendingButton: {
      flexDirection: 'row',
      backgroundColor: '#F59E0B' + '15',
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      borderWidth: 1,
      borderColor: '#F59E0B' + '30',
    },
    pendingButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: '#F59E0B',
    },
    pendingCancelHint: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: '#F59E0B' + '80',
    },

    // Pending Requests Section
    requestsSection: {
      gap: SPACING.md,
    },
    requestCountBadge: {
      backgroundColor: c.primary,
      borderRadius: 10,
      minWidth: 22,
      height: 22,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    requestCountText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFF',
    },
    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.lg,
      gap: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    requestInfo: {
      flex: 1,
      gap: 2,
    },
    requestMessage: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    requestActions: {
      flexDirection: 'row',
      gap: SPACING.xs,
    },
    approveBtn: {
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 1,
    },
    approveBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: '#FFF',
    },
    rejectBtn: {
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 1,
    },
    rejectBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textSecondary,
    },

    // Recent Posts Section
    postsSection: {
      gap: SPACING.md,
    },
    postsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    postsSectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    writePostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    writePostText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },
    postsList: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    postRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.lg,
      gap: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    postRowLast: {
      borderBottomWidth: 0,
    },
    postContent: {
      flex: 1,
      gap: 2,
    },
    postTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    postMeta: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    postStats: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    postStatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    postStatText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },
    emptyPosts: {
      paddingVertical: SPACING.xxl,
      alignItems: 'center',
    },
    emptyPostsText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Members Section
    membersSection: {
      gap: SPACING.md,
    },
    membersSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    membersSectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    membersSectionCount: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textTertiary,
    },
    membersList: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.lg,
      gap: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    memberRowLast: {
      borderBottomWidth: 0,
    },
    membersAvatarRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      flexWrap: 'wrap',
    },
    memberAvatarImg: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    memberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarMore: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarMoreText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textSecondary,
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
    viewAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.sm,
      gap: 4,
    },
    viewAllText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },
    emptyMembers: {
      paddingVertical: SPACING.xxl,
      alignItems: 'center',
    },
    emptyMembersText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
  });
