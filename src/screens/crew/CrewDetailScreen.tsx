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
  ActionSheetIOS,
  Platform,
  RefreshControl,
  Image,
  Dimensions,
  LayoutAnimation,
  UIManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewItem, CrewMemberItem, CrewJoinRequestItem, CommunityPostItem, CrewChallengeItem, CrewWeeklyRankingItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { communityService } from '../../services/communityService';
import { crewChallengeService } from '../../services/crewChallengeService';
import { useCourseListStore } from '../../stores/courseListStore';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { getGradeName, getGradeColor } from '../../utils/crewGrade';
import { formatRelativeTime } from '../../utils/format';
import CrewLevelBadge, { getTier } from '../../components/crew/CrewLevelBadge';
import CrewLevelGuideSheet from '../../components/crew/CrewLevelGuideSheet';
import { getXpProgress, formatXpDistance } from '../../utils/crewLevelConfig';
import { useToastStore } from '../../stores/toastStore';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewDetail'>;
type Route = RouteProp<HomeStackParamList, 'CrewDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const COVER_HEIGHT = 180;
const MEMBER_PREVIEW_LIMIT = 5;
const POSTS_PER_PAGE = 10;

export default function CrewDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { crewId } = route.params;
  const colors = useTheme();
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.showToast);
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
  const [activeRaid, setActiveRaid] = useState<CrewChallengeItem | null>(null);
  const [isEndingRaid, setIsEndingRaid] = useState(false);
  const [weeklyRanking, setWeeklyRanking] = useState<CrewWeeklyRankingItem[]>([]);
  const [postsPage, setPostsPage] = useState(0);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [raidExpanded, setRaidExpanded] = useState(false);
  const [showLevelGuide, setShowLevelGuide] = useState(false);

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

      // Load active raid
      if (crewData.is_member) {
        try {
          const raid = await crewChallengeService.getActiveChallenge(crewId);
          setActiveRaid(raid);
        } catch {
          // ignore
        }
      }

      // Load recent posts for members
      if (crewData.is_member) {
        try {
          const postsData = await communityService.getPosts({ crew_id: crewId, per_page: POSTS_PER_PAGE });
          setRecentPosts(postsData.data);
          setPostsPage(0);
          setHasMorePosts(postsData.data.length === POSTS_PER_PAGE);
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

  useEffect(() => {
    if (!crewId) return;
    crewService.getWeeklyRanking(crewId).then(res => setWeeklyRanking(res.data)).catch((err) => {
      console.warn('[CrewDetail] 주간 랭킹 조회 실패:', err);
    });
  }, [crewId]);

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
        showToast('success', t('crew.joinedSuccess'));
      }
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.joinFailed'));
    } finally {
      setIsJoining(false);
    }
  }, [crewId, isJoining, t, crew?.requires_approval, showToast]);

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

  const handleSelectRaidCourse = useCallback(() => {
    useCourseListStore.getState().setPendingSelectForRaid(crewId);
    (navigation as any).navigate('CourseTab', { screen: 'CourseList' });
  }, [navigation, crewId]);

  const handleEndRaid = useCallback(async () => {
    if (!activeRaid || isEndingRaid) return;
    Alert.alert(
      t('raid.endRaid'),
      t('raid.endRaidConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('raid.endRaid'),
          style: 'destructive',
          onPress: async () => {
            setIsEndingRaid(true);
            try {
              await crewChallengeService.endChallenge(crewId, activeRaid.id);
              setActiveRaid(null);
            } catch {
              Alert.alert(t('common.errorTitle'), t('common.error'));
            } finally {
              setIsEndingRaid(false);
            }
          },
        },
      ],
    );
  }, [activeRaid, isEndingRaid, crewId, t]);

  const handleRunRaidCourse = useCallback(() => {
    if (!activeRaid?.course_id) return;
    useCourseListStore.getState().setPendingStartCourseId(activeRaid.course_id);
    (navigation as any).navigate('WorldTab', { screen: 'World' });
  }, [navigation, activeRaid]);

  const handleOpenBoard = useCallback(() => {
    if (!crew) return;
    navigation.navigate('CrewBoard', { crewId, crewName: crew.name });
  }, [navigation, crewId, crew]);

  const loadMorePosts = useCallback(async () => {
    if (isLoadingMorePosts || !hasMorePosts) return;
    setIsLoadingMorePosts(true);
    try {
      const nextPage = postsPage + 1;
      const postsData = await communityService.getPosts({
        crew_id: crewId,
        per_page: POSTS_PER_PAGE,
        page: nextPage,
      });
      setRecentPosts(prev => [...prev, ...postsData.data]);
      setPostsPage(nextPage);
      setHasMorePosts(postsData.data.length === POSTS_PER_PAGE);
    } catch {
      // ignore
    } finally {
      setIsLoadingMorePosts(false);
    }
  }, [isLoadingMorePosts, hasMorePosts, postsPage, crewId]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distanceFromBottom < 200 && hasMorePosts && !isLoadingMorePosts) {
      loadMorePosts();
    }
  }, [hasMorePosts, isLoadingMorePosts, loadMorePosts]);

  const handleViewAllMembers = useCallback(() => {
    navigation.navigate('CrewMembers', { crewId });
  }, [navigation, crewId]);

  const handleManage = useCallback(() => {
    navigation.navigate('CrewManage', { crewId });
  }, [navigation, crewId]);

  const handleMoreMenu = useCallback(() => {
    const options = [t('crew.leave'), t('common.cancel')];
    const destructiveIndex = 0;
    const cancelIndex = 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: destructiveIndex,
          cancelButtonIndex: cancelIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === destructiveIndex) handleLeave();
        },
      );
    } else {
      Alert.alert(
        '',
        '',
        [
          { text: t('crew.leave'), style: 'destructive', onPress: handleLeave },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      );
    }
  }, [t, handleLeave]);

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
          <View style={{ flex: 1 }} />
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
                onPress={() => navigation.navigate('CrewNotifications', { crewId })}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {pendingCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity
                onPress={handleManage}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            )}
            {crew?.is_member && crew?.my_role !== 'owner' && (
              <TouchableOpacity
                onPress={handleMoreMenu}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </TouchableOpacity>
            )}
            {!crew?.is_member && !canEdit && <View style={styles.headerSpacer} />}
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={400}
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
            <View style={styles.logoWrapper}>
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
              <View style={styles.logoLevelBadge}>
                <CrewLevelBadge level={crew.level} size="sm" />
              </View>
            </View>
          </View>

          <View style={styles.contentContainer}>
            {/* Crew Name & Description */}
            <View style={styles.profileSection}>
              <Text style={styles.crewName}>{crew.name}</Text>

              {/* Info — directly under name */}
              <View style={styles.infoRow}>
                <Ionicons name="people" size={14} color={colors.primary} />
                <Text style={styles.infoText}>
                  {crew.member_count}{crew.max_members ? `/${crew.max_members}` : ''} {t('crew.members')}
                </Text>
                {crew.recurring_schedule ? (
                  <>
                    <View style={styles.infoDot} />
                    <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                    <Text style={styles.infoText}>{crew.recurring_schedule}</Text>
                  </>
                ) : null}
                {crew.meeting_point ? (
                  <>
                    <View style={styles.infoDot} />
                    <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                    <Text style={styles.infoText} numberOfLines={1}>{crew.meeting_point}</Text>
                  </>
                ) : null}
              </View>

              {crew.description ? (
                <Text style={styles.crewDescription}>{crew.description}</Text>
              ) : null}

              {(() => {
                const xp = getXpProgress(crew.level, crew.total_xp);
                const tier = getTier(crew.level ?? 1);
                const pct = Math.round(xp.ratio * 100);
                return (
                  <TouchableOpacity
                    style={[styles.xpContainer, { backgroundColor: tier.bg, borderColor: tier.border }]}
                    activeOpacity={0.85}
                    onPress={() => setShowLevelGuide(true)}
                  >
                    <View style={styles.xpTopRow}>
                      <Ionicons name="trending-up" size={14} color={tier.border} />
                      <Text style={[styles.xpTitle, { color: tier.text }]}>
                        {xp.isMax ? 'MAX LEVEL' : `Lv.${crew.level ?? 1} → Lv.${(crew.level ?? 1) + 1}`}
                      </Text>
                      <Text style={[styles.xpPct, { color: tier.border }]}>
                        {xp.isMax ? '100%' : `${pct}%`}
                      </Text>
                      <Ionicons name="information-circle-outline" size={14} color={tier.border} style={{ marginLeft: 4 }} />
                    </View>
                    <View style={[styles.xpBarTrack, { backgroundColor: tier.border + '20' }]}>
                      <View style={[styles.xpBarFill, { width: `${pct}%`, backgroundColor: tier.border }]} />
                    </View>
                  </TouchableOpacity>
                );
              })()}
            </View>

            {/* Action Buttons (join / pending — leave moved to bottom) */}
            {!crew.is_member && (
              <View style={styles.actionSection}>
                {crew.join_request_status === 'pending' ? (
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
            )}

            {/* Current Raid Section */}
            {crew.is_member && (
              <View style={styles.raidSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="flash" size={18} color={colors.primary} />
                  <Text style={styles.sectionHeaderTitle}>{t('raid.currentRaid')}</Text>
                </View>
                {activeRaid ? (
                  <TouchableOpacity
                    style={styles.raidCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setRaidExpanded(prev => !prev);
                    }}
                  >
                    {/* Slim header — always visible */}
                    <View style={styles.raidSlimRow}>
                      <View style={styles.raidLabelRow}>
                        <Ionicons name="flash" size={12} color="#FF7A33" />
                        <Text style={styles.raidLabel}>RAID</Text>
                      </View>
                      <View style={styles.raidSlimInfo}>
                        <Text style={styles.raidSlimCourseName} numberOfLines={1}>
                          {activeRaid.course_name || t('raid.unknownCourse')}
                        </Text>
                        {activeRaid.course_distance_meters != null && (
                          <View style={styles.raidDistanceBadge}>
                            <Text style={styles.raidDistanceBadgeText}>
                              {(activeRaid.course_distance_meters / 1000).toFixed(1)}km
                            </Text>
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={raidExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>

                    {/* Slim progress — always visible */}
                    <View style={styles.raidProgressContainer}>
                      <View style={styles.raidProgressBarBg}>
                        <View
                          style={[
                            styles.raidProgressBarFill,
                            {
                              width: `${activeRaid.total_participants > 0
                                ? Math.min(100, (activeRaid.completed_count / activeRaid.total_participants) * 100)
                                : 0}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.raidProgressText}>
                        {t('raid.participationStatus', {
                          completed: activeRaid.completed_count,
                          total: activeRaid.total_participants,
                        })}
                      </Text>
                    </View>

                    {/* Expanded details */}
                    {raidExpanded && (
                      <View style={styles.raidExpandedContent}>
                        {/* Top 3 records */}
                        {activeRaid.records.filter(r => r.best_duration_seconds != null).length > 0 && (
                          <View style={styles.raidRecordsList}>
                            {activeRaid.records
                              .filter(r => r.best_duration_seconds != null)
                              .slice(0, 3)
                              .map((record, idx) => {
                                const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                                const rankLabels = ['1st', '2nd', '3rd'];
                                const mins = Math.floor((record.best_duration_seconds || 0) / 60);
                                const secs = (record.best_duration_seconds || 0) % 60;
                                return (
                                  <View key={record.user_id} style={styles.raidRecordRow}>
                                    <View style={[styles.raidRankBadge, { backgroundColor: rankColors[idx] + '25' }]}>
                                      <Text style={[styles.raidRankText, { color: rankColors[idx] }]}>
                                        {rankLabels[idx]}
                                      </Text>
                                    </View>
                                    <Text style={styles.raidRecordName} numberOfLines={1}>
                                      {record.nickname || '?'}
                                    </Text>
                                    <Text style={styles.raidRecordTime}>
                                      {mins}:{secs.toString().padStart(2, '0')}
                                    </Text>
                                  </View>
                                );
                              })}
                          </View>
                        )}

                        {/* Run button */}
                        <TouchableOpacity
                          style={styles.raidRunButton}
                          onPress={handleRunRaidCourse}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="play" size={22} color="#FFFFFF" />
                          <Text style={styles.raidRunButtonText}>{t('raid.run')}</Text>
                        </TouchableOpacity>

                        {/* End raid button */}
                        {canEdit && (
                          <TouchableOpacity
                            style={styles.raidEndButton}
                            onPress={handleEndRaid}
                            disabled={isEndingRaid}
                            activeOpacity={0.7}
                          >
                            {isEndingRaid ? (
                              <ActivityIndicator size="small" color={colors.textTertiary} />
                            ) : (
                              <Text style={styles.raidEndButtonText}>{t('raid.endRaid')}</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                ) : canEdit ? (
                  <TouchableOpacity
                    style={styles.raidSelectCourseBtn}
                    onPress={handleSelectRaidCourse}
                    activeOpacity={0.7}
                  >
                    <View style={styles.raidSelectCourseInner}>
                      <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
                      <Text style={styles.raidSelectCourseText}>{t('raid.selectCourse')}</Text>
                      <Text style={styles.raidSelectCourseHint}>{t('raid.noActiveRaid')}</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.raidEmpty}>
                    <Ionicons name="shield-outline" size={28} color={colors.textTertiary} />
                    <Text style={styles.raidEmptyText}>{t('raid.noActiveRaid')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Recent Posts (members only) */}
            {crew.is_member && (
              <View style={styles.postsSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
                  <Text style={styles.sectionHeaderTitle}>{t('social.crewBoard')}</Text>
                  <View style={{ flex: 1 }} />
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
                  <View style={styles.postsCard}>
                    {recentPosts.map((post, postIdx) => {
                      const initial = (post.author.nickname ?? '?').charAt(0).toUpperCase();
                      return (
                        <TouchableOpacity
                          key={post.id}
                          style={[styles.postItem, postIdx > 0 && styles.postItemBorder]}
                          onPress={() => navigation.navigate('CommunityPostDetail', { postId: post.id })}
                          activeOpacity={0.6}
                        >
                          {/* Author row */}
                          <View style={styles.postAuthorRow}>
                            {post.author.avatar_url ? (
                              <Image source={{ uri: post.author.avatar_url }} style={styles.postAvatar} />
                            ) : (
                              <View style={styles.postAvatarPlaceholder}>
                                <Text style={styles.postAvatarText}>{initial}</Text>
                              </View>
                            )}
                            <Text style={styles.postNickname} numberOfLines={1}>{post.author.nickname ?? '?'}</Text>
                            <Text style={styles.postDot}>&middot;</Text>
                            <Text style={styles.postTime}>{formatRelativeTime(post.created_at)}</Text>
                          </View>
                          {/* Body */}
                          <Text style={styles.postBody} numberOfLines={3}>
                            {post.title ? <><Text style={styles.postTitleInline}>{post.title}  </Text>{post.content}</> : post.content}
                          </Text>
                          {post.image_url && (
                            <Image source={{ uri: post.image_url }} style={styles.postImagePreview} resizeMode="cover" />
                          )}
                          <View style={styles.postActions}>
                            {post.like_count > 0 && (
                              <View style={styles.postActionItem}>
                                <Ionicons name={post.is_liked ? 'heart' : 'heart-outline'} size={14} color={post.is_liked ? '#EF4444' : colors.textTertiary} />
                                <Text style={[styles.postActionText, post.is_liked && { color: '#EF4444' }]}>{post.like_count}</Text>
                              </View>
                            )}
                            {post.comment_count > 0 && (
                              <View style={styles.postActionItem}>
                                <Ionicons name="chatbubble-outline" size={13} color={colors.textTertiary} />
                                <Text style={styles.postActionText}>{post.comment_count}</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {/* See all button */}
                    <TouchableOpacity
                      style={styles.seeAllBtn}
                      onPress={handleOpenBoard}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.seeAllText}>{t('common.seeMore')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyPosts}>
                    <Text style={styles.emptyPostsText}>{t('social.noPosts')}</Text>
                  </View>
                )}
                {isLoadingMorePosts && (
                  <View style={styles.loadingMorePosts}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </View>
            )}

            {/* Weekly Ranking */}
            {weeklyRanking.length > 0 && (
              <View style={styles.weeklySection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="trophy-outline" size={18} color={colors.primary} />
                  <Text style={styles.sectionHeaderTitle}>{t('crew.weeklyRanking')}</Text>
                </View>
                <View style={styles.weeklyCard}>
                  {weeklyRanking.slice(0, 5).map((item, idx) => {
                    const total = Math.min(weeklyRanking.length, 5);
                    return (
                      <View key={item.user_id} style={[styles.weeklyRow, idx < total - 1 && styles.weeklyRowBorder]}>
                        <Text style={[styles.weeklyRank, idx === 0 && styles.weeklyRankGold]}>
                          #{item.rank}
                        </Text>
                        <Text style={styles.weeklyName} numberOfLines={1}>
                          {item.nickname ?? '-'}
                        </Text>
                        <Text style={styles.weeklyDistance}>
                          {(item.weekly_distance / 1000).toFixed(1)}km
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

          </View>
        </ScrollView>
      </SafeAreaView>

      <CrewLevelGuideSheet
        visible={showLevelGuide}
        onClose={() => setShowLevelGuide(false)}
        currentLevel={crew?.level ?? 1}
        totalXp={crew?.total_xp ?? 0}
      />
    </BlurredBackground>
  );
}

// ---- Sub-components ----

function MemberRow({
  member,
  isLast,
  onPress,
  gradeConfig,
}: {
  member: CrewMemberItem;
  isLast: boolean;
  onPress: () => void;
  gradeConfig?: CrewItem['grade_config'];
}) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initial = (member.nickname ?? '?').charAt(0).toUpperCase();
  const gradeLevel = member.grade_level ?? (member.role === 'owner' ? 5 : member.role === 'admin' ? 4 : 1);
  const gradeName = getGradeName(gradeLevel, gradeConfig, t);
  const gradeColor = getGradeColor(gradeLevel, colors);

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
        <View style={[styles.roleBadge, { backgroundColor: gradeColor + '20' }]}>
          <Text style={[styles.roleBadgeText, { color: gradeColor }]}>
            {gradeName}
          </Text>
        </View>
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
      gap: SPACING.xxl,
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
    notifBadge: {
      position: 'absolute',
      top: -4,
      right: -6,
      backgroundColor: '#EF4444',
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 3,
    },
    notifBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    // Cover image
    coverImage: {
      width: SCREEN_WIDTH,
      height: COVER_HEIGHT,
    },
    coverPlaceholder: {
      width: SCREEN_WIDTH,
      height: COVER_HEIGHT * 0.7,
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
    logoWrapper: {
      position: 'relative',
    },
    logoLevelBadge: {
      position: 'absolute',
      bottom: -2,
      right: -6,
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

    // Info row
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    infoText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    infoDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: c.textTertiary,
    },

    // Action Buttons
    actionSection: {},
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

    // Section header (shared)
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionHeaderTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },

    // Raid Section
    raidSection: {
      gap: SPACING.md,
    },
    raidCard: {
      backgroundColor: c.primary + '10',
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: c.primary + '30',
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    raidSlimRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    raidLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    raidLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '900',
      color: c.primary,
      letterSpacing: 2,
      textTransform: 'uppercase' as const,
    },
    raidSlimInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    raidSlimCourseName: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
    },
    raidExpandedContent: {
      gap: SPACING.lg,
      paddingTop: SPACING.sm,
    },
    raidDistanceBadge: {
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    raidDistanceBadgeText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    raidProgressContainer: {
      gap: SPACING.xs,
    },
    raidProgressBarBg: {
      height: 12,
      backgroundColor: c.primary + '15',
      borderRadius: 6,
      overflow: 'hidden',
      position: 'relative' as const,
    },
    raidProgressBarFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 6,
      position: 'absolute' as const,
      top: 0,
      left: 0,
    },
    raidProgressText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textSecondary,
      textAlign: 'right',
    },
    raidRecordsList: {
      gap: SPACING.sm,
    },
    raidRecordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    raidRankBadge: {
      width: 36,
      height: 24,
      borderRadius: BORDER_RADIUS.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    raidRankText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '900',
    },
    raidRecordName: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    raidRecordTime: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    raidRunButton: {
      flexDirection: 'row',
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    raidRunButtonText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    raidEndButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xs,
    },
    raidEndButtonText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },
    raidSelectCourseBtn: {
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 2,
      borderColor: c.primary + '40',
      borderStyle: 'dashed',
      backgroundColor: c.primary + '06',
      overflow: 'hidden',
    },
    raidSelectCourseInner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.xl,
    },
    raidSelectCourseText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.primary,
    },
    raidSelectCourseHint: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
    raidEmpty: {
      paddingVertical: SPACING.xxxl,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    raidEmptyText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Pending Requests Section
    // Pending requests banner
    pendingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primary + '10',
      borderRadius: 12,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    pendingBannerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primary + '18',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pendingBannerText: {
      flex: 1,
      gap: 1,
    },
    pendingBannerTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    pendingBannerSub: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textSecondary,
    },
    pendingBannerBadge: {
      backgroundColor: c.primary,
      borderRadius: 10,
      minWidth: 22,
      height: 22,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    pendingBannerBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFF',
    },

    // Posts Section
    postsSection: {
      gap: SPACING.md,
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
    postsCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    postItem: {
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    postItemBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    postAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    postAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    postAvatarPlaceholder: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    postAvatarText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      color: c.textSecondary,
    },
    postNickname: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      flexShrink: 1,
    },
    postDot: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
    },
    postTime: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    postBody: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '400',
      color: c.text,
      lineHeight: 20,
    },
    postTitleInline: {
      fontWeight: '700',
    },
    postImagePreview: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    postActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingTop: 2,
    },
    postActionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    postActionText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },
    seeAllBtn: {
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    seeAllText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },
    emptyPosts: {
      paddingVertical: SPACING.xxl,
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyPostsText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Members Section (used by pending requests and MemberRow)
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
    loadingMorePosts: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },

    // XP bar
    xpContainer: {
      width: '100%',
      marginTop: 10,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      gap: SPACING.sm,
    },
    xpTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    xpTitle: {
      flex: 1,
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    xpPct: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '900',
    },
    xpBarTrack: {
      height: 14,
      borderRadius: 7,
      overflow: 'hidden' as const,
    },
    xpBarFill: {
      height: '100%',
      borderRadius: 7,
      minWidth: 4,
    },

    // Weekly ranking
    weeklySection: {
      gap: SPACING.md,
    },
    weeklyCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    weeklyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    weeklyRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    weeklyRank: {
      width: 32,
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    weeklyRankGold: {
      color: '#FFD700',
    },
    weeklyName: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.text,
    },
    weeklyDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },
  });
