import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES } from '../../utils/constants';

interface Props {
  elevationProfile: number[];
  width: number;
  height?: number;
}

export default function ElevationProfileChart({ elevationProfile, width, height = 120 }: Props) {
  const colors = useTheme();

  const { bars, minElev, maxElev } = useMemo(() => {
    if (elevationProfile.length < 2) return { bars: [], minElev: 0, maxElev: 0 };

    const mn = Math.min(...elevationProfile);
    const mx = Math.max(...elevationProfile);
    const range = mx - mn || 1;
    const padMin = mn - range * 0.05;
    const padMax = mx + range * 0.1;
    const yRange = padMax - padMin;

    const chartH = height - 24; // leave room for labels
    const labelWidth = 36;
    const chartW = width - labelWidth;

    // Downsample to ~chartW bars max
    const step = Math.max(1, Math.floor(elevationProfile.length / chartW));
    const result: Array<{ x: number; h: number }> = [];

    for (let i = 0; i < elevationProfile.length; i += step) {
      const x = labelWidth + (i / (elevationProfile.length - 1)) * (chartW - 1);
      const normalized = (elevationProfile[i] - padMin) / yRange;
      result.push({ x, h: Math.max(1, normalized * chartH) });
    }

    return { bars: result, minElev: mn, maxElev: mx };
  }, [elevationProfile, width, height]);

  if (elevationProfile.length < 2) return null;

  const chartH = height - 24;

  return (
    <View style={{ width, height }}>
      {/* Y-axis labels */}
      <View style={styles.yLabels}>
        <Text style={[styles.yLabel, { color: colors.textTertiary }]}>{Math.round(maxElev)}m</Text>
        <Text style={[styles.yLabel, { color: colors.textTertiary }]}>{Math.round(minElev)}m</Text>
      </View>

      {/* Chart area */}
      <View style={[styles.chartArea, { height: chartH, marginLeft: 36 }]}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac, i) => (
          <View key={i} style={[styles.gridLine, { top: `${frac * 100}%`, backgroundColor: colors.divider }]} />
        ))}

        {/* Fill area — vertical bars from bottom */}
        {bars.map((bar, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: bar.x,
              bottom: 0,
              width: Math.max(1, (width - 36) / bars.length),
              height: bar.h,
              backgroundColor: colors.primary + '30',
            }}
          />
        ))}

        {/* Top line */}
        {bars.map((bar, i) => (
          <View
            key={`t${i}`}
            style={{
              position: 'absolute',
              left: bar.x,
              bottom: bar.h - 1,
              width: Math.max(1, (width - 36) / bars.length + 1),
              height: 2,
              backgroundColor: colors.primary,
            }}
          />
        ))}
      </View>

      {/* Elevation gain summary */}
      <View style={styles.xLabels}>
        <Text style={[styles.xLabel, { color: colors.textTertiary }]}>0km</Text>
        <Text style={[styles.xLabel, { color: colors.textTertiary }]}>
          +{Math.round(maxElev - minElev)}m
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabels: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 24,
    width: 34,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  yLabel: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chartArea: { overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, marginLeft: 36 },
  xLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500' },
});
