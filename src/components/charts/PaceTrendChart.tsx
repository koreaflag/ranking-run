import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface PaceTrendItem {
  date: string;
  avg_pace: number;
  distance_meters: number;
}

interface Props {
  data: PaceTrendItem[];
  height?: number;
}

const CHART_LEFT_PAD = 42;
const SCREEN_W = Dimensions.get('window').width;
// Chart typically rendered inside a card with SPACING.xxl * 2 horizontal padding + SPACING.xl * 2 card padding
const CHART_W = SCREEN_W - 24 * 2 - 20 * 2 - CHART_LEFT_PAD;

export default function PaceTrendChart({ data, height = 140 }: Props) {
  const colors = useTheme();

  const chartH = height - 28;

  const { points, segments, yLabels } = useMemo(() => {
    if (data.length < 2) return { points: [], segments: [], yLabels: [] };

    const paces = data.map(d => d.avg_pace);
    const mn = Math.min(...paces);
    const mx = Math.max(...paces);
    const range = mx - mn || 60;
    const padMin = Math.max(0, mn - range * 0.15);
    const padMax = mx + range * 0.15;
    const yRange = padMax - padMin;

    const pad = 6;
    const w = CHART_W - pad * 2;
    const h = chartH - pad * 2;

    const pts = data.map((d, i) => ({
      x: pad + (w * i) / (data.length - 1),
      // Lower pace (faster) = higher on chart (smaller y)
      y: pad + ((d.avg_pace - padMin) / yRange) * h,
    }));

    const segs: { x: number; y: number; length: number; angle: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 0.5) continue;
      segs.push({
        x: pts[i].x,
        y: pts[i].y,
        length,
        angle: Math.atan2(dy, dx) * (180 / Math.PI),
      });
    }

    const mid = Math.round((mn + mx) / 2);
    return {
      points: pts,
      segments: segs,
      yLabels: [formatPace(mn), formatPace(mid), formatPace(mx)],
    };
  }, [data, chartH]);

  if (data.length < 2) return null;

  return (
    <View style={{ height }}>
      <View style={styles.yLabels}>
        {yLabels.map((label, i) => (
          <Text key={i} style={[styles.yLabel, { color: colors.textTertiary }]}>{label}</Text>
        ))}
      </View>

      <View style={[styles.chartArea, { height: chartH, marginLeft: CHART_LEFT_PAD }]}>
        {[0, 0.5, 1].map((frac, i) => (
          <View key={i} style={[styles.gridLine, { top: `${frac * 100}%`, backgroundColor: colors.divider }]} />
        ))}

        {segments.map((seg, i) => (
          <View
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: seg.x,
              top: seg.y - 1.25,
              width: seg.length,
              height: 2.5,
              backgroundColor: colors.primary,
              borderRadius: 1.25,
              transform: [{ rotate: `${seg.angle}deg` }],
              transformOrigin: 'left center',
            }}
          />
        ))}

        {points.map((pt, i) => (
          <View
            key={`p${i}`}
            style={[styles.dot, {
              left: pt.x - 3.5,
              top: pt.y - 3.5,
              backgroundColor: i === points.length - 1 ? colors.primary : colors.card,
              borderColor: colors.primary,
            }]}
          />
        ))}
      </View>

      <View style={[styles.xLabels, { marginLeft: CHART_LEFT_PAD }]}>
        <Text style={[styles.xLabel, { color: colors.textTertiary }]}>
          {new Date(data[0].date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
        </Text>
        <Text style={[styles.xLabel, { color: colors.textTertiary }]}>
          {new Date(data[data.length - 1].date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
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
    bottom: 28,
    width: 38,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  yLabel: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chartArea: { overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.6 },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, borderWidth: 2 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  xLabel: { fontSize: 10, fontWeight: '500' },
});
