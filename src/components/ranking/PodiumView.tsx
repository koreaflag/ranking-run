import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS, type ThemeColors } from '../../utils/constants';
import { formatDuration } from '../../utils/format';
import type { RankingEntry } from '../../types/api';

interface Props {
  entries: RankingEntry[];
  onUserPress?: (userId: string) => void;
}

export default function PodiumView({ entries, onUserPress }: Props) {
  const colors = useTheme();
  const styles = createStyles(colors);

  if (entries.length === 0) return null;

  const first = entries[0];
  const second = entries[1];
  const third = entries[2];

  // Display order: 2nd, 1st, 3rd
  const podiumOrder = [second, first, third];
  const MEDAL_COLORS = [COLORS.silver, COLORS.gold, COLORS.bronze];
  const AVATAR_SIZES = [48, 56, 48];
  const PILLAR_HEIGHTS = [72, 88, 60];

  return (
    <View style={styles.container}>
      {podiumOrder.map((entry, i) => {
        if (!entry) return <View key={i} style={styles.podiumSlot} />;
        const rank = [2, 1, 3][i];
        const avatarSize = AVATAR_SIZES[i];
        const pillarH = PILLAR_HEIGHTS[i];
        const medalColor = MEDAL_COLORS[i];
        const isFirst = rank === 1;

        return (
          <TouchableOpacity
            key={entry.user.id}
            style={styles.podiumSlot}
            onPress={() => onUserPress?.(entry.user.id)}
            activeOpacity={0.7}
          >
            {/* Avatar */}
            <View style={[
              styles.avatarRing,
              { width: avatarSize + 4, height: avatarSize + 4, borderRadius: (avatarSize + 4) / 2, borderColor: medalColor },
              isFirst && { ...SHADOWS.glow },
            ]}>
              {entry.user.avatar_url ? (
                <Image
                  source={{ uri: entry.user.avatar_url }}
                  style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                  <Ionicons name="person" size={avatarSize * 0.4} color={colors.textTertiary} />
                </View>
              )}
            </View>

            {/* GPS verified badge */}
            {entry.gps_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
              </View>
            )}

            {/* Nickname */}
            <Text style={[styles.nickname, isFirst && styles.nicknameFirst]} numberOfLines={1}>
              {entry.user.nickname}
            </Text>

            {/* Country flag */}
            {entry.user.country && (
              <Text style={styles.country}>{entry.user.country}</Text>
            )}

            {/* Time */}
            <Text style={[styles.time, isFirst && styles.timeFirst]}>
              {formatDuration(entry.best_duration_seconds)}
            </Text>

            {/* Pillar */}
            <View style={[styles.pillar, { height: pillarH, backgroundColor: medalColor + '20' }]}>
              <Text style={[styles.rankText, { color: medalColor }]}>{rank}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  podiumSlot: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 120,
  },
  avatarRing: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  avatarPlaceholder: {
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: c.card,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nickname: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
    maxWidth: 80,
  },
  nicknameFirst: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  country: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginBottom: 2,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textSecondary,
    marginBottom: SPACING.xs,
  },
  timeFirst: {
    color: c.primary,
    fontSize: FONT_SIZES.md,
  },
  pillar: {
    width: '80%',
    borderTopLeftRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
  },
});
