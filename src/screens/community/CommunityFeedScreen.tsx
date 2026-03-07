import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
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
  ImageBackground,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CrewItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CommunityFeed'>;

// ---- Helpers ----

const getJoinStatus = (crew: CrewItem): 'member' | 'pending' | 'join' | 'request' => {
  if (crew.is_member) return 'member';
  if (crew.join_request_status === 'pending') return 'pending';
  if (crew.requires_approval) return 'request';
  return 'join';
};

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
                ? t('crew.joined')
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

// Module-level cache: survives tab switches
let _cachedExplore: CrewItem[] = [];
let _cachedMyCrews: CrewItem[] = [];

// ---- Main ----

export default function CommunityFeedScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<'explore' | 'myCrews'>('explore');

  // Explore tab state (initialized from module cache)
  const [exploreCrews, setExploreCrews] = useState<CrewItem[]>(_cachedExplore);
  const [explorePage, setExplorePage] = useState(0);
  const [exploreHasMore, setExploreHasMore] = useState(true);
  const [exploreLoading, setExploreLoading] = useState(_cachedExplore.length === 0);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const exploreLoadingMore = useRef(false);

  // My crews tab state (initialized from module cache)
  const [myCrews, setMyCrews] = useState<CrewItem[]>(_cachedMyCrews);
  const [myCrewsLoading, setMyCrewsLoading] = useState(_cachedMyCrews.length === 0);
  const [myCrewsRefreshing, setMyCrewsRefreshing] = useState(false);

  const loadExplore = useCallback(async (page: number, refresh = false) => {
    if (page === 0) {
      if (refresh) setExploreRefreshing(true);
      else setExploreLoading(true);
    }
    try {
      const res = await crewService.listCrews({ page, per_page: 20 });
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

  useEffect(() => {
    loadExplore(0);
    loadMyCrews();
  }, [loadExplore, loadMyCrews]);

  const handleExploreEndReached = useCallback(() => {
    if (!exploreHasMore || exploreLoadingMore.current) return;
    exploreLoadingMore.current = true;
    loadExplore(explorePage + 1);
  }, [exploreHasMore, explorePage, loadExplore]);

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

  // ---- Header navigation handlers ----

  const handleNavigateToFriends = useCallback(() => {
    navigation.navigate('Friends');
  }, [navigation]);

  const handleNavigateToCrewSearch = useCallback(() => {
    navigation.navigate('CrewSearch');
  }, [navigation]);

  const handleNavigateToCrewCreate = useCallback(() => {
    navigation.navigate('CrewCreate');
  }, [navigation]);

  const handleExploreRefresh = useCallback(() => {
    loadExplore(0, true);
  }, [loadExplore]);

  const handleMyCrewsRefresh = useCallback(() => {
    loadMyCrews(true);
  }, [loadMyCrews]);

  const handleSetExploreTab = useCallback(() => {
    setActiveTab('explore');
  }, []);

  const handleSetMyCrewsTab = useCallback(() => {
    setActiveTab('myCrews');
  }, []);

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
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('social.title')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleNavigateToFriends}
              activeOpacity={0.6}
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleNavigateToCrewSearch}
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
            style={[styles.tab, activeTab === 'explore' && styles.tabActive]}
            onPress={handleSetExploreTab}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'explore' && styles.tabTextActive]}>
              {t('crew.explore')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'myCrews' && styles.tabActive]}
            onPress={handleSetMyCrewsTab}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'myCrews' && styles.tabTextActive]}>
              {t('crew.myCrews')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Explore Tab */}
        {activeTab === 'explore' && (
          exploreLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={exploreCrews}
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
                ) : null
              }
            />
          )
        )}

        {/* My Crews Tab */}
        {activeTab === 'myCrews' && (
          myCrewsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={myCrews}
              renderItem={renderMyCrewCard}
              keyExtractor={myCrewKeyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={7}
              ListEmptyComponent={MyCrewsEmpty}
              refreshControl={
                <RefreshControl
                  refreshing={myCrewsRefreshing}
                  onRefresh={handleMyCrewsRefresh}
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
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
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
      width: 36,
      height: 36,
      borderRadius: 18,
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

    // Footer loading
    footerLoading: {
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },
  });
