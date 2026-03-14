import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import type { Split } from '../../types/api';

interface SplitHistoryPanelProps {
  splits: Split[];
  expanded: boolean;
  onToggle: () => void;
}

const MAX_VISIBLE_SPLITS = 5;
const SPLIT_ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;

export default function SplitHistoryPanel({
  splits,
  expanded,
  onToggle,
}: SplitHistoryPanelProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const animatedHeight = useRef(new Animated.Value(0)).current;

  // Reverse so most recent split is on top
  const reversedSplits = useMemo(() => [...splits].reverse(), [splits]);

  const contentHeight = Math.min(reversedSplits.length, MAX_VISIBLE_SPLITS) * SPLIT_ROW_HEIGHT;

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: expanded ? contentHeight : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, contentHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatElevation = useCallback((meters: number) => {
    if (meters > 0) return `+${Math.round(meters)}m`;
    if (meters < 0) return `${Math.round(meters)}m`;
    return '0m';
  }, []);

  if (splits.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Toggle button */}
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="list-outline" size={14} color={colors.primary} />
          <Text style={styles.headerTitle}>
            {'\uC2A4\uD50C\uB9BF'}
          </Text>
          <View style={styles.splitCountBadge}>
            <Text style={styles.splitCountText}>{splits.length}</Text>
          </View>
        </View>
        {/* Latest split preview when collapsed */}
        {!expanded && splits.length > 0 && (
          <Text style={styles.previewPace}>
            {splits[splits.length - 1].split_number}km{' '}
            {formatPace(splits[splits.length - 1].pace_seconds_per_km)}
          </Text>
        )}
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-up'}
          size={14}
          color={colors.textTertiary}
        />
      </TouchableOpacity>

      {/* Expandable split list */}
      <Animated.View style={[styles.listWrapper, { height: animatedHeight }]}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Column headers */}
          <View style={styles.columnHeaders}>
            <Text style={[styles.colHeaderText, styles.colKm]}>km</Text>
            <Text style={[styles.colHeaderText, styles.colPace]}>
              {'\uD398\uC774\uC2A4'}
            </Text>
            <Text style={[styles.colHeaderText, styles.colElev]}>
              {'\uACE0\uB3C4'}
            </Text>
          </View>
          {reversedSplits.map((split) => (
            <View key={split.split_number} style={styles.splitRow}>
              <Text style={[styles.splitKm, styles.colKm]}>
                {split.split_number}
              </Text>
              <Text style={[styles.splitPace, styles.colPace]}>
                {formatPace(split.pace_seconds_per_km)}
              </Text>
              <Text style={[styles.splitElev, styles.colElev]}>
                {formatElevation(split.elevation_change_meters)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.sm,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: HEADER_HEIGHT,
      paddingHorizontal: SPACING.md,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    splitCountBadge: {
      backgroundColor: c.primary + '20',
      borderRadius: BORDER_RADIUS.xs,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    splitCountText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },
    previewPace: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
      flex: 1,
      textAlign: 'right',
      marginRight: SPACING.sm,
    },
    listWrapper: {
      overflow: 'hidden',
    },
    scrollView: {
      paddingHorizontal: SPACING.md,
    },
    columnHeaders: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
      marginBottom: 2,
    },
    colHeaderText: {
      fontSize: 10,
      fontWeight: '500',
      color: c.textTertiary,
      textTransform: 'uppercase',
    },
    colKm: {
      width: 36,
      textAlign: 'center',
    },
    colPace: {
      flex: 1,
      textAlign: 'center',
    },
    colElev: {
      width: 56,
      textAlign: 'right',
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: SPLIT_ROW_HEIGHT,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    splitKm: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    splitPace: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    splitElev: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
  });
