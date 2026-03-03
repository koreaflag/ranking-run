import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

interface Split {
  split_number: number;
  pace_seconds_per_km: number;
  duration_seconds: number;
  distance_meters: number;
}

interface Props {
  splits: Split[];
  height?: number;
}

export default function SplitBarsChart({ splits, height = 120 }: Props) {
  const colors = useTheme();

  const { bars, fastestIdx } = useMemo(() => {
    if (splits.length === 0) return { bars: [], fastestIdx: -1 };

    const paces = splits.map(s => s.pace_seconds_per_km);
    const minPace = Math.min(...paces);
    const maxPace = Math.max(...paces);
    const range = maxPace - minPace || 60;
    // Lower pace = taller bar (faster)
    let fastIdx = 0;

    const b = splits.map((s, i) => {
      if (s.pace_seconds_per_km === minPace) fastIdx = i;
      // Invert: fastest gets highest bar
      const normalizedHeight = 1 - (s.pace_seconds_per_km - minPace) / (range * 1.3);
      return {
        split: s.split_number,
        pace: s.pace_seconds_per_km,
        heightPercent: Math.max(normalizedHeight * 100, 15), // minimum 15% height
      };
    });

    return { bars: b, fastestIdx: fastIdx };
  }, [splits]);

  if (bars.length === 0) return null;

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barsRow}>
        {bars.map((bar, i) => {
          const isFastest = i === fastestIdx;
          return (
            <View key={bar.split} style={styles.barContainer}>
              <Text style={[styles.paceLabel, {
                color: isFastest ? colors.primary : colors.textTertiary,
                fontWeight: isFastest ? '800' : '600',
              }]}>
                {formatPace(bar.pace)}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.bar, {
                    height: `${bar.heightPercent}%`,
                    backgroundColor: isFastest ? colors.primary : colors.primary + '50',
                    borderRadius: BORDER_RADIUS.xs,
                  }]}
                />
              </View>
              <Text style={[styles.splitLabel, { color: colors.textTertiary }]}>
                {bar.split}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  paceLabel: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  barTrack: {
    flex: 1,
    width: '80%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
  },
  splitLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
});
