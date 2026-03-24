import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, type ThemeColors } from '../../utils/constants';
import { formatDuration, formatPace } from '../../utils/format';

interface Props {
  rank: number;
  totalRunners: number;
  percentile?: number | null;
  bestDurationSeconds: number;
  bestPaceSecondsPerKm: number;
  rankChange?: number | null;
  gpsVerified?: boolean;
}

export default function MyRankBanner({
  rank,
  totalRunners,
  bestDurationSeconds,
  bestPaceSecondsPerKm,
  rankChange,
  gpsVerified,
}: Props) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {/* GPS verified */}
        {gpsVerified && (
          <Ionicons name="shield-checkmark" size={16} color={colors.primary} style={styles.shieldIcon} />
        )}

        {/* Rank */}
        <Text style={styles.rankPrimary}>#{rank}</Text>

        {/* Time */}
        <Text style={styles.time}>{formatDuration(bestDurationSeconds)}</Text>
      </View>

      <View style={styles.bottomRow}>
        {/* Pace */}
        <Text style={styles.pace}>{formatPace(bestPaceSecondsPerKm)}/km</Text>

        {/* Rank change */}
        {rankChange != null && rankChange !== 0 && (
          <View style={styles.changeContainer}>
            <Ionicons
              name={rankChange > 0 ? 'caret-up' : 'caret-down'}
              size={12}
              color={rankChange > 0 ? COLORS.success : COLORS.error}
            />
            <Text style={[styles.changeText, { color: rankChange > 0 ? COLORS.success : COLORS.error }]}>
              {Math.abs(rankChange)} {t('ranking.rankChange')}
            </Text>
          </View>
        )}

        {/* Total runners */}
        <Text style={styles.totalRunners}>
          / {totalRunners}{t('ranking.runners')}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: c.primary + '14',
    borderWidth: 1,
    borderColor: c.primary + '33',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  shieldIcon: {
    marginRight: SPACING.xs,
  },
  rankPrimary: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.primary,
    marginRight: SPACING.md,
  },
  time: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pace: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    marginRight: SPACING.sm,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  changeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    marginLeft: 2,
  },
  totalRunners: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginLeft: 'auto',
  },
});
