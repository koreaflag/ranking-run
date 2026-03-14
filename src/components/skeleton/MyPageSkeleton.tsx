import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonBox, SkeletonText, SkeletonCircle, SkeletonCard } from '../common/Skeleton';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { SPACING, BORDER_RADIUS } from '../../utils/constants';

/**
 * Skeleton loading placeholder that matches the MyPageScreen layout:
 *  - Player card: avatar circle + follower/following/likes counts
 *  - Name row + crew tag
 *  - Edit profile button
 *  - Runner level banner
 *  - Period tabs
 *  - Hero stats card
 *  - Recent runs list
 */
export default function MyPageSkeleton() {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* ---- Player Card ---- */}
      <View style={styles.playerCard}>
        {/* Top row: Avatar + follower stats */}
        <View style={styles.playerCardTop}>
          <SkeletonCircle size={72} />
          <View style={styles.statsRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.statItem}>
                <SkeletonText width={28} height={18} />
                <SkeletonText width={40} height={11} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>
        </View>

        {/* Name + badge */}
        <View style={styles.metaSection}>
          <View style={styles.nameRow}>
            <SkeletonText width={100} height={16} />
            <SkeletonBox width={36} height={18} borderRadius={4} />
          </View>
          {/* Crew tag */}
          <SkeletonText width={80} height={12} style={{ marginTop: 4 }} />
        </View>

        {/* Edit profile button */}
        <SkeletonBox
          width="100%"
          height={36}
          borderRadius={BORDER_RADIUS.sm}
          style={{ marginTop: SPACING.md }}
        />
      </View>

      {/* ---- Runner Level Banner ---- */}
      <SkeletonCard style={styles.bannerSkeleton}>
        <View style={styles.bannerInner}>
          <View style={{ gap: 6, flex: 1 }}>
            <SkeletonText width={120} height={14} />
            <SkeletonBox width="100%" height={8} borderRadius={4} />
          </View>
        </View>
      </SkeletonCard>

      {/* ---- Period Tabs ---- */}
      <View style={styles.periodBar}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox
            key={i}
            width={56}
            height={28}
            borderRadius={BORDER_RADIUS.md - 2}
          />
        ))}
      </View>

      {/* ---- Hero Stats Card ---- */}
      <SkeletonCard style={styles.heroCard}>
        {/* Big distance */}
        <View style={styles.heroCentered}>
          <SkeletonText width={140} height={40} />
          <SkeletonText width={24} height={16} style={{ marginTop: 4 }} />
        </View>

        {/* Secondary stats row */}
        <View style={styles.heroSecondary}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.heroSecondaryItem}>
              <SkeletonText width={40} height={18} />
              <SkeletonText width={32} height={10} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>

        {/* Stat grid 2x2 */}
        <View style={styles.statGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.statGridCell}>
              <SkeletonCircle size={16} />
              <SkeletonText width={48} height={14} />
              <SkeletonText width={36} height={10} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ---- Recent Runs ---- */}
      <View style={styles.sectionHeader}>
        <SkeletonText width={80} height={16} />
        <SkeletonText width={40} height={12} />
      </View>

      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} style={styles.runCard}>
          <View style={styles.runCardInner}>
            <SkeletonBox width={56} height={56} borderRadius={BORDER_RADIUS.sm} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonText width="70%" height={14} />
              <View style={styles.runStatsRow}>
                <SkeletonText width={48} height={12} />
                <SkeletonText width={48} height={12} />
                <SkeletonText width={48} height={12} />
              </View>
            </View>
          </View>
        </SkeletonCard>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      gap: SPACING.md,
    },

    // Player card
    playerCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
    },
    playerCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xl,
    },
    statsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    metaSection: {
      marginTop: SPACING.md,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },

    // Banner
    bannerSkeleton: {
      height: undefined,
      padding: SPACING.lg,
    },
    bannerInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    // Period tabs
    periodBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xs,
    },

    // Hero card
    heroCard: {
      height: undefined,
      padding: SPACING.xl,
    },
    heroCentered: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    heroSecondary: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    heroSecondaryItem: {
      alignItems: 'center',
      gap: 4,
    },

    // Stat grid
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.md,
      gap: SPACING.md,
    },
    statGridCell: {
      width: '46%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },

    // Section header
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.sm,
    },

    // Run cards
    runCard: {
      height: undefined,
      padding: SPACING.md,
    },
    runCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    runStatsRow: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
  });
