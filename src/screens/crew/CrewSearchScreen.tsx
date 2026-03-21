import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewItem } from '../../types/api';
import { useCrewStore } from '../../stores/crewStore';
import RegionPickerModal from '../../components/crew/RegionPickerModal';
import { shortProvinceName } from '../../data/koreaRegions';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { formatRelativeTime } from '../../utils/format';
import CrewLevelBadge from '../../components/crew/CrewLevelBadge';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewSearch'>;

export default function CrewSearchScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    crews,
    isLoading,
    isLoadingMore,
    totalCount,
    searchQuery,
    regionFilter,
    setSearchQuery,
    setRegionFilter,
    fetchCrews,
    fetchMoreCrews,
  } = useCrewStore();
  const [regionPickerVisible, setRegionPickerVisible] = useState(false);

  useEffect(() => {
    fetchCrews(true);
    return () => {
      setSearchQuery('');
      setRegionFilter('');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchCrews(true);
      }, 400);
    },
    [setSearchQuery, fetchCrews],
  );

  const handleRegionSelect = useCallback(
    (region: string | null) => {
      setRegionFilter(region ?? '');
      fetchCrews(true);
    },
    [setRegionFilter, fetchCrews],
  );

  const handleCrewPress = useCallback(
    (crewId: string) => {
      navigation.navigate('CrewDetail', { crewId });
    },
    [navigation],
  );

  const renderCrew = useCallback(
    ({ item }: { item: CrewItem }) => (
      <TouchableOpacity
        style={styles.crewCard}
        onPress={() => handleCrewPress(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.crewIcon, { backgroundColor: item.badge_color + '20' }]}>
          <Ionicons name="people" size={22} color={item.badge_color} />
        </View>
        <View style={styles.crewInfo}>
          <View style={styles.crewNameRow}>
            <CrewLevelBadge level={item.level} size="sm" />
            <Text style={styles.crewName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View style={styles.crewMeta}>
            <Ionicons name="people-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.crewMetaText}>
              {t('crew.memberCount', { count: item.member_count })}
            </Text>
            {item.region && (
              <>
                <Text style={styles.crewMetaDivider}>·</Text>
                <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
                <Text style={styles.crewMetaText}>{item.region}</Text>
              </>
            )}
          </View>
          {item.last_activity_at && (
            <Text style={styles.crewActivityText}>
              {t('format.lastActive', { time: formatRelativeTime(item.last_activity_at) })}
            </Text>
          )}
        </View>
        {item.is_member && (
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedText}>{t('crew.joined_short')}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    ),
    [styles, colors, handleCrewPress, t],
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [isLoadingMore, styles, colors]);

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
          <Text style={styles.headerTitle}>{t('crew.searchCrews')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('crew.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Region filter chip */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, regionFilter ? styles.filterChipActive : null]}
            onPress={() => setRegionPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="location-outline"
              size={14}
              color={regionFilter ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.filterChipText, regionFilter ? styles.filterChipTextActive : null]}>
              {regionFilter ? shortProvinceName(regionFilter) : t('crew.selectRegion')}
            </Text>
            {regionFilter ? (
              <TouchableOpacity
                onPress={() => handleRegionSelect(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={14} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
        <RegionPickerModal
          visible={regionPickerVisible}
          onClose={() => setRegionPickerVisible(false)}
          onSelect={handleRegionSelect}
          selectedRegion={regionFilter || null}
          provinceOnly
        />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : crews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{t('crew.noCrewsFound')}</Text>
          </View>
        ) : (
          <FlatList
            data={crews}
            keyExtractor={(item) => item.id}
            renderItem={renderCrew}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={fetchMoreCrews}
            onEndReachedThreshold={0.3}
            ListFooterComponent={renderFooter}
          />
        )}
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
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
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

    // Search
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.lg,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
      paddingVertical: SPACING.md,
    },

    // Filter
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary + '15',
      borderColor: c.primary,
    },
    filterChipText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    filterChipTextActive: {
      color: c.primary,
    },

    // List
    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 100,
      gap: SPACING.sm,
    },
    crewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    crewIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    crewInfo: {
      flex: 1,
      gap: 3,
    },
    crewNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    crewName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      flexShrink: 1,
    },
    crewMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    crewMetaText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    crewMetaDivider: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      marginHorizontal: 1,
    },
    crewActivityText: {
      fontSize: FONT_SIZES.xs - 1,
      fontWeight: '400',
      color: c.textTertiary,
      marginTop: 1,
    },
    joinedBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary + '20',
    },
    joinedText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
    },

    // Footer
    footer: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
  });
