import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { SkeletonBox, SkeletonText, SkeletonCircle, SkeletonCard } from '../common/Skeleton';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { SPACING, BORDER_RADIUS } from '../../utils/constants';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * Skeleton loading placeholder that matches the CourseDetailScreen layout:
 *  - Map placeholder (full-width)
 *  - Title + difficulty badge
 *  - Creator row
 *  - Dashboard stats (3-column grid)
 *  - Course stats card
 *  - Ranking list items
 */
export default function CourseDetailSkeleton() {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* ---- Map Placeholder ---- */}
      <SkeletonBox
        width={SCREEN_WIDTH}
        height={220}
        borderRadius={0}
      />

      <View style={styles.body}>
        {/* ---- Title Section ---- */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <SkeletonText width="65%" height={22} />
            <SkeletonBox width={56} height={24} borderRadius={BORDER_RADIUS.xs} />
          </View>
          <SkeletonText width="90%" height={14} style={{ marginTop: SPACING.sm }} />
          {/* Creator row */}
          <View style={styles.creatorRow}>
            <SkeletonText width={20} height={12} />
            <SkeletonText width={80} height={12} />
            <View style={{ flex: 1 }} />
            <SkeletonCircle size={28} />
            <SkeletonCircle size={28} />
          </View>
        </View>

        {/* ---- Dashboard Stats ---- */}
        <SkeletonCard style={styles.dashboardCard}>
          <View style={styles.dashboardGrid}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={styles.dashboardDivider} />}
                <View style={styles.dashboardCell}>
                  <SkeletonText width={56} height={20} />
                  <SkeletonText width={40} height={10} style={{ marginTop: 6 }} />
                </View>
              </React.Fragment>
            ))}
          </View>
        </SkeletonCard>

        {/* ---- Course Stats ---- */}
        <SkeletonCard style={styles.statsCard}>
          <SkeletonText width={80} height={16} style={{ marginBottom: SPACING.md }} />
          <View style={styles.dashboardGrid}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={styles.dashboardDivider} />}
                <View style={styles.dashboardCell}>
                  <SkeletonText width={48} height={18} />
                  <SkeletonText width={36} height={10} style={{ marginTop: 6 }} />
                </View>
              </React.Fragment>
            ))}
          </View>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <View style={styles.dashboardGrid}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={styles.dashboardDivider} />}
                <View style={styles.dashboardCell}>
                  <SkeletonText width={48} height={18} />
                  <SkeletonText width={36} height={10} style={{ marginTop: 6 }} />
                </View>
              </React.Fragment>
            ))}
          </View>
        </SkeletonCard>

        {/* ---- Ranking Section ---- */}
        <SkeletonCard style={styles.rankingCard}>
          <SkeletonText width={60} height={16} style={{ marginBottom: SPACING.md }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.rankingRow}>
              <SkeletonCircle size={28} />
              <SkeletonCircle size={36} />
              <View style={{ flex: 1, gap: 4 }}>
                <SkeletonText width="60%" height={14} />
                <SkeletonText width="30%" height={10} />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <SkeletonText width={48} height={14} />
                <SkeletonText width={36} height={10} />
              </View>
            </View>
          ))}
        </SkeletonCard>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },

    body: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      gap: SPACING.lg,
    },

    // Title
    titleSection: {
      gap: SPACING.xs,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },

    // Dashboard card
    dashboardCard: {
      height: undefined,
      padding: SPACING.lg,
    },
    dashboardGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dashboardCell: {
      flex: 1,
      alignItems: 'center',
    },
    dashboardDivider: {
      width: 1,
      height: 32,
      backgroundColor: c.border,
    },

    // Stats card
    statsCard: {
      height: undefined,
      padding: SPACING.lg,
    },
    rowDivider: {
      height: 1,
      marginVertical: SPACING.md,
    },

    // Ranking card
    rankingCard: {
      height: undefined,
      padding: SPACING.lg,
    },
    rankingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
  });
