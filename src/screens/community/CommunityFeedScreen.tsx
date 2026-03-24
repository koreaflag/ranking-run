import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import RegionPickerModal from '../../components/crew/RegionPickerModal';
import CountryPickerModal from '../../components/common/CountryPickerModal';
import RunningAvatarIndicator from '../../components/common/RunningAvatarIndicator';
import { shortProvinceName } from '../../data/koreaRegions';
import { getCountryFlag, getCountryName } from '../../data/countries';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CrewItem, WeeklyRunnerEntry, FriendRunning } from '../../types/api';
import { crewService } from '../../services/crewService';
import { rankingService } from '../../services/rankingService';
import { userService } from '../../services/userService';
import { friendService } from '../../services/friendService';
import { formatDistance } from '../../utils/format';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import CrewLevelBadge from '../../components/crew/CrewLevelBadge';
import { ListEndIndicator } from '../../components/common/Skeleton';
import { useAuthStore } from '../../stores/authStore';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CommunityFeed'>;

// ---- Helpers ----

const getJoinStatus = (crew: CrewItem): 'member' | 'pending' | 'join' | 'request' => {
  if (crew.is_member) return 'member';
  if (crew.join_request_status === 'pending') return 'pending';
  if (crew.requires_approval) return 'request';
  return 'join';
};

const MEDAL_COLORS = ['#FFD700', '#9CA3AF', '#CD7F32'] as const;

// ---- Memoized Card Components ----

interface ExploreCardProps {
  item: CrewItem;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

const ExploreCard = memo(function ExploreCard({ item: crew, onPress, styles, colors, t }: ExploreCardProps) {
  const joinStatus = getJoinStatus(crew);
  const hasCover = !!crew.cover_image_url;

  return (
    <TouchableOpacity
      style={styles.exploreCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Cover */}
      {hasCover ? (
        <ImageBackground
          source={{ uri: crew.cover_image_url! }}
          style={styles.exploreCover}
          imageStyle={styles.exploreCoverImage}
        >
          <View style={styles.exploreCoverGradient} />
        </ImageBackground>
      ) : (
        <View
          style={[
            styles.exploreCover,
            { backgroundColor: crew.badge_color || colors.primary },
          ]}
        >
          <Ionicons
            name={(crew.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
            size={32}
            color="rgba(255,255,255,0.3)"
          />
        </View>
      )}

      {/* Logo */}
      <View style={styles.exploreLogoWrap}>
        {crew.logo_url ? (
          <Image source={{ uri: crew.logo_url }} style={styles.exploreLogo} />
        ) : (
          <View
            style={[
              styles.exploreLogo,
              { backgroundColor: crew.badge_color || colors.primary },
            ]}
          >
            <Ionicons
              name={(crew.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
              size={18}
              color="#FFF"
            />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.exploreInfo}>
        <View style={styles.exploreNameRow}>
          <CrewLevelBadge level={crew.level} size="sm" />
          <Text style={styles.exploreName} numberOfLines={1}>
            {crew.name}
          </Text>
          {crew.region && (
            <View style={styles.regionBadge}>
              <Text style={styles.regionBadgeText}>{crew.region}</Text>
            </View>
          )}
        </View>
        {crew.description ? (
          <Text style={styles.exploreDesc} numberOfLines={2}>
            {crew.description}
          </Text>
        ) : null}

        <View style={styles.exploreBottom}>
          <View style={styles.exploreStats}>
            <Ionicons name="people-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.exploreStatText}>
              {crew.member_count}{crew.max_members ? `/${crew.max_members}` : ''}
            </Text>
            <Text style={styles.exploreDot}>·</Text>
            <Ionicons
              name={crew.requires_approval ? 'shield-checkmark-outline' : 'enter-outline'}
              size={12}
              color={colors.textTertiary}
            />
            <Text style={styles.exploreStatText}>
              {crew.requires_approval ? t('crew.requiresApproval') : t('crew.freeJoin')}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              joinStatus === 'member' && styles.statusBadgeMember,
              joinStatus === 'pending' && styles.statusBadgePending,
              (joinStatus === 'join' || joinStatus === 'request') && styles.statusBadgeJoin,
            ]}
          >
            {joinStatus === 'member' && (
              <Ionicons name="checkmark-circle" size={13} color={colors.primary} style={{ marginRight: 3 }} />
            )}
            <Text
              style={[
                styles.statusBadgeText,
                joinStatus === 'member' && styles.statusTextMember,
                joinStatus === 'pending' && styles.statusTextPending,
                (joinStatus === 'join' || joinStatus === 'request') && styles.statusTextJoin,
              ]}
            >
              {joinStatus === 'member'
                ? t('crew.joinedStatus')
                : joinStatus === 'pending'
                  ? t('crew.pending')
                  : joinStatus === 'request'
                    ? t('crew.requestJoin')
                    : t('crew.join')}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

interface MyCrewCardProps {
  item: CrewItem;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

const MyCrewCard = memo(function MyCrewCard({ item: crew, onPress, styles, colors, t }: MyCrewCardProps) {
  const isAdmin = crew.my_role === 'owner' || crew.my_role === 'admin';
  return (
    <TouchableOpacity
      style={styles.myCrewCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Logo */}
      {crew.logo_url ? (
        <Image source={{ uri: crew.logo_url }} style={styles.myCrewLogo} />
      ) : (
        <View
          style={[
            styles.myCrewLogo,
            { backgroundColor: crew.badge_color || colors.primary },
          ]}
        >
          <Ionicons
            name={(crew.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
            size={22}
            color="#FFF"
          />
        </View>
      )}

      {/* Info */}
      <View style={styles.myCrewInfo}>
        <View style={styles.myCrewNameRow}>
          <CrewLevelBadge level={crew.level} size="sm" />
          <Text style={styles.myCrewName} numberOfLines={1}>
            {crew.name}
          </Text>
          {isAdmin && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {crew.my_role === 'owner' ? t('crew.owner') : t('crew.admin')}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.myCrewMeta}>
          {t('crew.memberCount', { count: crew.member_count })}
          {crew.region ? ` · ${crew.region}` : ''}
          {crew.recurring_schedule ? ` · ${crew.recurring_schedule}` : ''}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
});

interface RunnerRowProps {
  item: WeeklyRunnerEntry;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  highlight?: boolean;
}

const RunnerRow = memo(function RunnerRow({ item, onPress, styles, colors, t, highlight }: RunnerRowProps) {
  const isMedal = item.rank <= 3;
  const medalColor = isMedal ? MEDAL_COLORS[item.rank - 1] : undefined;

  return (
    <TouchableOpacity
      style={[
        styles.rrRow,
        highlight && {
          borderColor: colors.primary,
          backgroundColor: colors.primary + '10',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Rank */}
      <View style={[styles.rrRankBadge, medalColor ? { backgroundColor: medalColor } : { backgroundColor: colors.surface }]}>
        <Text style={[styles.rrRankText, medalColor ? { color: '#FFF' } : { color: colors.textSecondary }]}>
          {item.rank}
        </Text>
      </View>

      {/* Avatar */}
      {item.user.avatar_url ? (
        <Image source={{ uri: item.user.avatar_url }} style={styles.rrAvatar} />
      ) : (
        <View style={[styles.rrAvatar, { backgroundColor: colors.surface }]}>
          <Ionicons name="person" size={16} color={colors.textTertiary} />
        </View>
      )}

      {/* Name + crew */}
      <View style={styles.rrInfo}>
        <Text style={styles.rrName} numberOfLines={1}>{item.user.nickname ?? '?'}</Text>
        {item.user.crew_name ? (
          <Text style={styles.rrCrew} numberOfLines={1}>{item.user.crew_name}</Text>
        ) : null}
      </View>

      {/* Stats */}
      <View style={styles.rrStats}>
        <Text style={styles.rrDistance}>{t('ranking.runs', { count: item.run_count })}</Text>
        <Text style={styles.rrMeta}>{formatDistance(item.total_distance_meters)}</Text>
      </View>
    </TouchableOpacity>
  );
});

// Module-level cache: survives tab switches
let _cachedExplore: CrewItem[] = [];
let _cachedMyCrews: CrewItem[] = [];

// ---- Main ----

export default function CommunityFeedScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<'explore' | 'friends' | 'ranking'>('ranking');
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Explore "내 크루" filter
  const [myCrewsOnly, setMyCrewsOnly] = useState(false);

  // Region filter
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);

  // Country filter (ranking tab)
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  // Explore tab state (initialized from module cache)
  const [exploreCrews, setExploreCrews] = useState<CrewItem[]>(_cachedExplore);
  const [explorePage, setExplorePage] = useState(0);
  const [exploreHasMore, setExploreHasMore] = useState(true);
  const [exploreLoading, setExploreLoading] = useState(_cachedExplore.length === 0);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const exploreLoadingMore = useRef(false);

  // Ranking tab state
  const [weeklyRunners, setWeeklyRunners] = useState<WeeklyRunnerEntry[]>([]);
  const [myRanking, setMyRanking] = useState<WeeklyRunnerEntry | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingRefreshing, setRankingRefreshing] = useState(false);
  const [showMyRanking, setShowMyRanking] = useState(false);
  const rankingListRef = useRef<FlatList>(null);

  // My crews tab state (initialized from module cache)
  const [myCrews, setMyCrews] = useState<CrewItem[]>(_cachedMyCrews);
  const [myCrewsLoading, setMyCrewsLoading] = useState(_cachedMyCrews.length === 0);
  const [myCrewsRefreshing, setMyCrewsRefreshing] = useState(false);

  // Friends tab state
  const [friends, setFriends] = useState<Array<{id: string; nickname: string; avatar_url: string | null}>>([]);
  const [friendsRunning, setFriendsRunning] = useState<FriendRunning[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);


  const loadExplore = useCallback(async (page: number, refresh = false, region?: string | null) => {
    if (page === 0) {
      if (refresh) setExploreRefreshing(true);
      else setExploreLoading(true);
    }
    try {
      const res = await crewService.listCrews({ page, per_page: 20, region: region || undefined });
      if (page === 0) {
        setExploreCrews(res.data); _cachedExplore = res.data;
      } else {
        setExploreCrews((prev) => { const next = [...prev, ...res.data]; _cachedExplore = next; return next; });
      }
      setExplorePage(page);
      setExploreHasMore(res.data.length >= 20);
    } catch {
      // ignore
    } finally {
      setExploreLoading(false);
      setExploreRefreshing(false);
      exploreLoadingMore.current = false;
    }
  }, []);

  const loadMyCrews = useCallback(async (refresh = false) => {
    if (refresh) setMyCrewsRefreshing(true);
    else setMyCrewsLoading(true);
    try {
      const res = await crewService.getMyCrews();
      setMyCrews(res); _cachedMyCrews = res;
    } catch {
      // ignore
    } finally {
      setMyCrewsLoading(false);
      setMyCrewsRefreshing(false);
    }
  }, []);

  const loadWeeklyRunners = useCallback(async (region?: string | null, country?: string | null, refresh = false) => {
    if (refresh) setRankingRefreshing(true);
    else setRankingLoading(true);
    try {
      const res = await rankingService.getWeeklyLeaderboard({
        region: region || undefined,
        country: country || undefined,
        limit: 20,
      });
      setWeeklyRunners(res.data);
      setMyRanking(res.my_ranking ?? null);
    } catch {
      // silent
    } finally {
      setRankingLoading(false);
      setRankingRefreshing(false);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    // Load friends and running status separately
    try {
      const friendsRes = await friendService.getFriends(0, 100);
      setFriends(
        (friendsRes.data ?? []).map((f) => ({
          id: f.user.id,
          nickname: f.user.nickname ?? '',
          avatar_url: f.user.avatar_url,
        })),
      );
    } catch {
      // silent
    }
    try {
      const runningRes = await userService.getFriendsRunning();
      setFriendsRunning(runningRes);
    } catch {
      // running status is non-critical
    }
    setFriendsLoading(false);
  }, []);

  // Filtered explore crews for "내 크루" chip
  const filteredExploreCrews = useMemo(() => {
    if (!myCrewsOnly) return exploreCrews;
    return exploreCrews.filter((c) => c.is_member);
  }, [exploreCrews, myCrewsOnly]);

  useEffect(() => {
    loadExplore(0, false, regionFilter);
    loadMyCrews();
  }, [loadExplore, loadMyCrews, regionFilter]);

  useEffect(() => {
    loadWeeklyRunners(regionFilter, countryFilter);
  }, [loadWeeklyRunners, regionFilter, countryFilter]);

  const handleExploreEndReached = useCallback(() => {
    if (!exploreHasMore || exploreLoadingMore.current) return;
    exploreLoadingMore.current = true;
    loadExplore(explorePage + 1, false, regionFilter);
  }, [exploreHasMore, explorePage, loadExplore, regionFilter]);

  const handleRegionSelect = useCallback((region: string | null) => {
    setRegionFilter(region);
  }, []);

  // ---- Renderers (delegate to memoized components) ----

  const renderExploreCard = useCallback(
    ({ item }: { item: CrewItem }) => (
      <ExploreCard
        item={item}
        onPress={() => navigation.navigate('CrewDetail', { crewId: item.id })}
        styles={styles}
        colors={colors}
        t={t}
      />
    ),
    [colors, navigation, styles, t],
  );

  const renderMyCrewCard = useCallback(
    ({ item }: { item: CrewItem }) => (
      <MyCrewCard
        item={item}
        onPress={() => navigation.navigate('CrewDetail', { crewId: item.id })}
        styles={styles}
        colors={colors}
        t={t}
      />
    ),
    [colors, navigation, styles, t],
  );

  const exploreKeyExtractor = useCallback((item: CrewItem) => item.id, []);
  const myCrewKeyExtractor = useCallback((item: CrewItem) => item.id, []);
  const friendKeyExtractor = useCallback((item: {id: string}) => item.id, []);

  const renderFriendRow = useCallback(
    ({ item }: { item: {id: string; nickname: string; avatar_url: string | null} }) => {
      const running = friendsRunning.find((f) => f.user_id === item.id);
      return (
        <TouchableOpacity
          style={styles.friendRow}
          onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          activeOpacity={0.7}
        >
          <RunningAvatarIndicator
            avatarUrl={item.avatar_url}
            nickname={item.nickname}
            size={44}
            isRunning={!!running}
          />
          <View style={styles.friendInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.friendName} numberOfLines={1}>{item.nickname}</Text>
              {running && (
                <View style={styles.friendRunningBadge}>
                  <Text style={styles.friendRunningBadgeText}>{t('social.running')}</Text>
                </View>
              )}
            </View>
            {running?.course_title && (
              <Text style={styles.friendCourse} numberOfLines={1}>{running.course_title}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      );
    },
    [colors, friendsRunning, navigation, styles, t],
  );

  // ---- Header navigation handlers ----

  const handleNavigateToFriends = useCallback(() => {
    navigation.navigate('Friends');
  }, [navigation]);

  const handleNavigateToSearch = useCallback(() => {
    navigation.navigate('UnifiedSearch');
  }, [navigation]);

  const handleNavigateToCrewCreate = useCallback(() => {
    navigation.navigate('CrewCreate');
  }, [navigation]);

  const handleExploreRefresh = useCallback(() => {
    loadExplore(0, true, regionFilter);
  }, [loadExplore, regionFilter]);

  const handleRankingRefresh = useCallback(() => {
    loadWeeklyRunners(regionFilter, countryFilter, true);
  }, [loadWeeklyRunners, regionFilter, countryFilter]);

  const handleMyCrewsRefresh = useCallback(() => {
    loadMyCrews(true);
  }, [loadMyCrews]);

  const handleFriendsRefresh = useCallback(() => {
    loadFriends();
  }, [loadFriends]);

  const handleSetExploreTab = useCallback(() => {
    setActiveTab('explore');
  }, []);

  const handleSetFriendsTab = useCallback(() => {
    setActiveTab('friends');
    loadFriends();
  }, [loadFriends]);

  const handleSetRankingTab = useCallback(() => {
    setActiveTab('ranking');
  }, []);

  // ---- Ranking Renderers ----

  const renderRunnerRow = useCallback(
    ({ item }: { item: WeeklyRunnerEntry }) => (
      <RunnerRow
        item={item}
        onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
        styles={styles}
        colors={colors}
        t={t}
      />
    ),
    [colors, navigation, styles, t],
  );

  const runnerKeyExtractor = useCallback((item: WeeklyRunnerEntry) => item.user.id, []);

  // ---- My Ranking scroll-to ----

  const handleToggleMyRanking = useCallback(() => {
    if (!myRanking) return;
    setShowMyRanking((prev) => {
      const next = !prev;
      if (next) {
        // Find index of my ranking in the list and scroll to it
        const idx = weeklyRunners.findIndex((r) => r.user.id === myRanking.user.id);
        if (idx >= 0) {
          setTimeout(() => {
            rankingListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
          }, 100);
        }
      }
      return next;
    });
  }, [myRanking, weeklyRunners]);

  // Highlight my entry in the list
  const renderRunnerRowWithHighlight = useCallback(
    ({ item }: { item: WeeklyRunnerEntry }) => {
      const isMe = showMyRanking && myRanking && item.user.id === myRanking.user.id;
      return (
        <RunnerRow
          item={item}
          onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
          styles={styles}
          colors={colors}
          t={t}
          highlight={!!isMe}
        />
      );
    },
    [colors, navigation, styles, t, showMyRanking, myRanking],
  );

  // ---- Empty states ----

  const ExploreEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={36} color={colors.textTertiary} />
        <Text style={styles.emptyText}>{t('crew.noCrewsFound')}</Text>
      </View>
    ),
    [colors, styles, t],
  );

  const MyCrewsEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="people-outline" size={36} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>{t('crew.noCrews')}</Text>
        <Text style={styles.emptySubtitle}>{t('crew.noCrewsDesc')}</Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={handleSetExploreTab}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={16} color="#FFF" />
          <Text style={styles.emptyBtnText}>{t('crew.findCrew')}</Text>
        </TouchableOpacity>
      </View>
    ),
    [colors, styles, t, handleSetExploreTab],
  );

  // ---- Render ----

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('social.title')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleNavigateToSearch}
              activeOpacity={0.6}
            >
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleNavigateToCrewCreate}
              activeOpacity={0.6}
            >
              <Ionicons name="add-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Segment Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ranking' && styles.tabActive]}
            onPress={handleSetRankingTab}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'ranking' && styles.tabTextActive]}>
              {t('ranking.tabLabel')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'explore' && styles.tabActive]}
            onPress={handleSetExploreTab}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'explore' && styles.tabTextActive]}>
              {t('crew.explore')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
            onPress={handleSetFriendsTab}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
              {t('social.friends')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Region Filter (Explore & Ranking tabs) */}
        {(activeTab === 'explore' || activeTab === 'ranking') && (
          <View style={styles.filterRow}>
            {activeTab === 'explore' && (
              <TouchableOpacity
                style={[styles.myCrewChip, myCrewsOnly && styles.myCrewChipActive]}
                onPress={() => setMyCrewsOnly((v) => !v)}
                activeOpacity={0.6}
              >
                {myCrewsOnly && (
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                )}
                <Text style={[styles.filterChipText, myCrewsOnly ? styles.filterChipTextActive : null]}>
                  {t('crew.myCrews')}
                </Text>
              </TouchableOpacity>
            )}
            {activeTab === 'ranking' && myRanking && (
              <TouchableOpacity
                style={[styles.filterChip, showMyRanking && styles.filterChipActive]}
                onPress={handleToggleMyRanking}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={showMyRanking ? '#FFF' : colors.textSecondary}
                />
                <Text style={[styles.filterChipText, showMyRanking ? styles.filterChipTextActive : null]}>
                  {t('ranking.myRanking')}
                </Text>
              </TouchableOpacity>
            )}
            {activeTab === 'ranking' && (
              <TouchableOpacity
                style={[styles.filterChip, countryFilter ? styles.filterChipActive : null]}
                onPress={() => setCountryPickerVisible(true)}
                activeOpacity={0.6}
              >
                <Text style={{ fontSize: 14 }}>
                  {countryFilter ? getCountryFlag(countryFilter) : '🌍'}
                </Text>
                <Text style={[styles.filterChipText, countryFilter ? styles.filterChipTextActive : null]}>
                  {countryFilter ? getCountryName(countryFilter) : t('ranking.allCountries')}
                </Text>
                {countryFilter ? (
                  <TouchableOpacity
                    onPress={() => setCountryFilter(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            )}
            {activeTab === 'explore' && (
              <TouchableOpacity
                style={[styles.filterChip, regionFilter ? styles.filterChipActive : null]}
                onPress={() => setRegionPickerVisible(true)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={regionFilter ? '#FFF' : colors.textSecondary}
                />
                <Text style={[styles.filterChipText, regionFilter ? styles.filterChipTextActive : null]}>
                  {regionFilter ? shortProvinceName(regionFilter) : t('crew.selectRegion')}
                </Text>
                {regionFilter ? (
                  <TouchableOpacity
                    onPress={() => setRegionFilter(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <RegionPickerModal
          visible={regionPickerVisible}
          onClose={() => setRegionPickerVisible(false)}
          onSelect={handleRegionSelect}
          selectedRegion={regionFilter}
          provinceOnly
        />
        <CountryPickerModal
          visible={countryPickerVisible}
          onClose={() => setCountryPickerVisible(false)}
          onSelect={(code) => setCountryFilter(code)}
          selectedCountry={countryFilter}
        />

        {/* Explore Tab */}
        {activeTab === 'explore' && (
          exploreLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredExploreCrews}
                renderItem={renderExploreCard}
                keyExtractor={exploreKeyExtractor}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onEndReached={handleExploreEndReached}
                onEndReachedThreshold={0.3}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={7}
                ListEmptyComponent={ExploreEmpty}
                refreshControl={
                  <RefreshControl
                    refreshing={exploreRefreshing}
                    onRefresh={handleExploreRefresh}
                    tintColor={colors.primary}
                  />
                }
                ListFooterComponent={
                  exploreLoadingMore.current ? (
                    <View style={styles.footerLoading}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : !exploreHasMore && exploreCrews.length > 0 ? (
                    <ListEndIndicator text={t('common.endOfList')} />
                  ) : null
                }
              />
            )
        )}

        {/* Friends Tab */}
        {activeTab === 'friends' && (
          friendsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={friends}
              renderItem={renderFriendRow}
              keyExtractor={friendKeyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={7}
              ListEmptyComponent={
                <View style={styles.friendsEmptyContainer}>
                  <Ionicons name="people-outline" size={36} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>{t('social.noFriends')}</Text>
                  <TouchableOpacity
                    style={styles.emptyBtn}
                    onPress={() => navigation.navigate('Friends')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="search" size={16} color="#FFF" />
                    <Text style={styles.emptyBtnText}>{t('social.findFriends')}</Text>
                  </TouchableOpacity>
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={handleFriendsRefresh}
                  tintColor={colors.primary}
                />
              }
            />
          )
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          rankingLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={rankingListRef}
              data={weeklyRunners}
              renderItem={renderRunnerRowWithHighlight}
              keyExtractor={runnerKeyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="trophy-outline" size={36} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>{t('ranking.noRankings')}</Text>
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={rankingRefreshing}
                  onRefresh={handleRankingRefresh}
                  tintColor={colors.primary}
                />
              }
            />
          )
        )}
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },

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
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.5,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Tab Bar
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.md,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: 3,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.md - 2,
      gap: 6,
    },
    tabActive: {
      backgroundColor: c.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    tabText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },
    tabTextActive: {
      color: c.text,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },

    // ═══ EXPLORE CARD ═══
    exploreCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: SPACING.md,
      overflow: 'hidden',
    },
    exploreCover: {
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
    exploreCoverImage: {
      borderTopLeftRadius: BORDER_RADIUS.lg - 1,
      borderTopRightRadius: BORDER_RADIUS.lg - 1,
    },
    exploreCoverGradient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    exploreLogoWrap: {
      marginTop: -20,
      marginLeft: SPACING.lg,
      marginBottom: -4,
      zIndex: 1,
    },
    exploreLogo: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 2.5,
      borderColor: c.card,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    exploreInfo: {
      padding: SPACING.lg,
      paddingTop: SPACING.sm,
      gap: 6,
    },
    exploreNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    exploreName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
      flexShrink: 1,
    },
    regionBadge: {
      backgroundColor: c.primary + '15',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 4,
    },
    regionBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
    },
    exploreDesc: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      lineHeight: 18,
    },
    exploreBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
    },
    exploreStats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    exploreStatText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    exploreDot: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      marginHorizontal: 1,
    },

    // Status badge
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 1,
      borderRadius: BORDER_RADIUS.full,
    },
    statusBadgeMember: {
      backgroundColor: c.primary + '15',
    },
    statusBadgePending: {
      backgroundColor: '#F59E0B' + '18',
    },
    statusBadgeJoin: {
      backgroundColor: c.primary + '15',
    },
    statusBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
    },
    statusTextMember: {
      color: c.primary,
    },
    statusTextPending: {
      color: '#F59E0B',
    },
    statusTextJoin: {
      color: c.primary,
    },

    // ═══ MY CREW CARD ═══
    myCrewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      marginBottom: SPACING.sm,
      gap: SPACING.md,
    },
    myCrewLogo: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    myCrewInfo: {
      flex: 1,
      gap: 3,
    },
    myCrewNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    myCrewName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
      flexShrink: 1,
    },
    roleBadge: {
      backgroundColor: c.primary + '15',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    roleBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
    },
    myCrewMeta: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // ═══ EMPTY STATE ═══
    emptyState: {
      alignItems: 'center',
      paddingVertical: SPACING.xxxl * 2,
      gap: SPACING.sm,
    },
    emptyText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
    emptyTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      marginTop: SPACING.sm,
    },
    emptySubtitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.full,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.xl,
      marginTop: SPACING.md,
    },
    emptyBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFF',
    },

    // ═══ RUNNER ROW ═══
    rrRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.md,
    },
    rrRankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rrRankText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
    },
    rrAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    rrInfo: {
      flex: 1,
      gap: 1,
    },
    rrName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    rrCrew: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    rrStats: {
      alignItems: 'flex-end',
      gap: 1,
    },
    rrDistance: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.primary,
    },
    rrMeta: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Region filter
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xl,
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.full,
      paddingVertical: SPACING.xs + 2,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    filterChipTextActive: {
      color: '#FFF',
    },

    // Footer loading
    footerLoading: {
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },

    // ═══ FRIENDS TAB ═══
    friendRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.md,
    },
    friendInfo: {
      flex: 1,
      marginLeft: SPACING.xs,
      gap: 2,
    },
    friendName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700' as const,
      color: c.text,
      flexShrink: 1,
    },
    friendRunningBadge: {
      backgroundColor: '#34C759',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
    },
    friendRunningBadgeText: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: '#FFF',
    },
    friendCourse: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500' as const,
      color: c.textTertiary,
    },
    friendsHeader: {
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    friendsHeaderText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700' as const,
      color: c.textSecondary,
    },
    friendsEmptyContainer: {
      alignItems: 'center' as const,
      paddingVertical: SPACING.xxxl * 2,
      gap: SPACING.sm,
    },

    // My crew filter chip (explore tab)
    myCrewChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.full,
      paddingVertical: SPACING.xs + 2,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    myCrewChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
  });
