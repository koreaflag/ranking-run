import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonBox, SkeletonText, SkeletonCard } from '../common/Skeleton';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { SPACING, BORDER_RADIUS } from '../../utils/constants';

/**
 * Skeleton loading placeholder that matches the HomeScreen layout:
 *  - Greeting text area
 *  - Weekly summary hero card
 *  - Favorite courses (horizontal scroll cards x2)
 *  - Recent runs list (3 items)
 */
export default function HomeSkeleton() {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* ---- Greeting ---- */}
      <View style={styles.greetingSection}>
        <SkeletonText width={180} height={22} />
        <SkeletonText width={140} height={13} style={{ marginTop: 6 }} />
      </View>

      {/* ---- Weekly Summary Hero Card ---- */}
      <SkeletonCard style={styles.weeklyCard}>
        {/* Title row */}
        <View style={styles.weeklyTitleRow}>
          <SkeletonText width={100} height={14} />
          <SkeletonText width={40} height={14} />
        </View>

        {/* Big distance */}
        <View style={styles.heroDistance}>
          <SkeletonText width={120} height={48} />
          <SkeletonText width={24} height={16} style={{ marginLeft: 6 }} />
        </View>

        {/* Mini stats row */}
        <View style={styles.miniStatsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.miniStatItem}>
              <SkeletonText width={32} height={14} />
              <SkeletonText width={48} height={11} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>
      </SkeletonCard>

      {/* ---- Favorite Courses ---- */}
      <View style={styles.sectionHeader}>
        <SkeletonText width={100} height={14} />
        <SkeletonText width={40} height={12} />
      </View>
      <View style={styles.favRow}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.favCard}>
            <SkeletonBox width={160} height={90} borderRadius={BORDER_RADIUS.lg} />
            <View style={styles.favInfo}>
              <SkeletonText width={120} height={13} />
              <SkeletonText width={80} height={11} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>

      {/* ---- Recent Runs ---- */}
      <View style={styles.sectionHeader}>
        <SkeletonText width={80} height={14} />
        <SkeletonText width={40} height={12} />
      </View>
      <SkeletonCard style={styles.recentCard}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.runItem,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
            ]}
          >
            <SkeletonBox width={56} height={56} borderRadius={8} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonText width="70%" height={14} />
              <SkeletonText width="40%" height={11} />
              <View style={styles.runStatsRow}>
                <SkeletonText width={48} height={12} />
                <SkeletonText width={48} height={12} />
                <SkeletonText width={48} height={12} />
              </View>
            </View>
          </View>
        ))}
      </SkeletonCard>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingTop: SPACING.md,
    },

    // Greeting
    greetingSection: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.lg,
    },

    // Weekly card
    weeklyCard: {
      marginHorizontal: SPACING.xxl,
      height: undefined,
      padding: SPACING.xl,
      marginBottom: SPACING.md,
    },
    weeklyTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    heroDistance: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: SPACING.lg,
    },
    miniStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    miniStatItem: {
      alignItems: 'center',
    },

    // Section header
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.sm,
      marginTop: SPACING.sm,
    },

    // Favorite courses row
    favRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    favCard: {
      width: 160,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    favInfo: {
      padding: SPACING.sm + 2,
    },

    // Recent runs
    recentCard: {
      marginHorizontal: SPACING.xxl,
      height: undefined,
      padding: SPACING.md,
    },
    runItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    runStatsRow: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
  });
