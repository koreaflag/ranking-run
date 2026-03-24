import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, FONT_SIZES } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import RunnerLevelBadge from '../runner/RunnerLevelBadge';
import { formatNumber } from '../../utils/format';
import { getCountryFlag, getCountryName } from '../../data/countries';

type Props = {
  nickname: string | null;
  avatarUrl: string | null;
  runnerLevel: number;
  crewName?: string | null;
  country?: string | null;
  bio?: string | null;
  instagramUsername?: string | null;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  totalDistanceMeters?: number;
  totalRuns?: number;
  onFollowersTap?: () => void;
  onFollowingTap?: () => void;
  onInstagramTap?: () => void;
  variant: 'mypage' | 'profile';
  children?: React.ReactNode;
};

export default function PlayerCard({
  nickname,
  avatarUrl,
  runnerLevel,
  crewName,
  country,
  bio,
  instagramUsername,
  followersCount,
  followingCount,
  likesCount,
  onFollowersTap,
  onFollowingTap,
  onInstagramTap,
  children,
}: Props) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Top Row: Avatar + Stats (Instagram style) */}
      <View style={styles.topRow}>
        <View style={styles.avatarWrapper}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={24} color={colors.textTertiary} />
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statItem}
            onPress={onFollowersTap}
            activeOpacity={onFollowersTap ? 0.6 : 1}
            disabled={!onFollowersTap}
          >
            <Text style={styles.statValue}>{formatNumber(followersCount)}</Text>
            <Text style={styles.statLabel}>{t('profile.followers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statItem}
            onPress={onFollowingTap}
            activeOpacity={onFollowingTap ? 0.6 : 1}
            disabled={!onFollowingTap}
          >
            <Text style={styles.statValue}>{formatNumber(followingCount)}</Text>
            <Text style={styles.statLabel}>{t('profile.following')}</Text>
          </TouchableOpacity>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatNumber(likesCount)}</Text>
            <Text style={styles.statLabel}>{t('profile.likes')}</Text>
          </View>
        </View>
      </View>

      {/* Identity: Name + Crew + Bio + Instagram */}
      <View style={styles.meta}>
        <View style={styles.nameRow}>
          <Text style={styles.nickname} numberOfLines={1}>
            {nickname ?? 'Runner'}
          </Text>
          <RunnerLevelBadge level={runnerLevel} size="sm" />
        </View>
        {(crewName || country) ? (
          <View style={styles.tagRow}>
            {crewName ? (
              <View style={styles.crewTag}>
                <Ionicons name="people" size={11} color={colors.primary} />
                <Text style={styles.crewTagText}>{crewName}</Text>
              </View>
            ) : null}
            {country ? (
              <View style={styles.countryTag}>
                <Text style={styles.countryFlag}>{getCountryFlag(country)}</Text>
                <Text style={styles.countryText}>{getCountryName(country)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {bio ? (
          <Text style={styles.bio} numberOfLines={2}>{bio}</Text>
        ) : null}
        {instagramUsername ? (
          <TouchableOpacity
            style={styles.instagramRow}
            onPress={onInstagramTap}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-instagram" size={13} color={colors.textTertiary} />
            <Text style={styles.instagramText}>@{instagramUsername}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Action buttons slot (edit profile / follow+friend) */}
      {children}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      // Flat layout, no card — same as MyPage
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      paddingTop: 4,
      paddingBottom: 12,
      gap: 28,
    },
    avatarWrapper: {
      width: 86,
      height: 86,
      borderRadius: 43,
    },
    avatarImage: {
      width: 86,
      height: 86,
      borderRadius: 43,
    },
    avatarCircle: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    statItem: {
      alignItems: 'center',
      gap: 2,
    },
    statValue: {
      fontSize: 17,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'] as const,
    },
    statLabel: {
      fontSize: 13,
      fontWeight: '400',
      color: c.textSecondary,
    },
    meta: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 0,
      gap: 4,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    nickname: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      letterSpacing: -0.3,
      flexShrink: 1,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    crewTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.primary + '15',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    crewTagText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
    },
    countryTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    countryFlag: {
      fontSize: 13,
    },
    countryText: {
      fontSize: 12,
      fontWeight: '500',
      color: c.textSecondary,
    },
    bio: {
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
    },
    instagramRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 1,
    },
    instagramText: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '600',
    },
  });
