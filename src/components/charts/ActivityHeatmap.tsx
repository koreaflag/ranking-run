import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';

interface ActivityDay {
  date: string;
  distance_meters: number;
  run_count: number;
}

interface Props {
  data: ActivityDay[];
}

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS = 13; // ~90 days
const DAYS = 7;

// Weekday labels
const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

export default function ActivityHeatmap({ data }: Props) {
  const colors = useTheme();

  const { grid, monthLabels, maxDistance } = useMemo(() => {
    // Build a map of date -> distance
    const dateMap = new Map<string, number>();
    let maxDist = 0;
    for (const d of data) {
      dateMap.set(d.date, d.distance_meters);
      if (d.distance_meters > maxDist) maxDist = d.distance_meters;
    }

    // Build grid: 13 weeks x 7 days, ending today
    const today = new Date();
    // Start from 13 weeks ago, aligned to Sunday
    const startDay = new Date(today);
    startDay.setDate(startDay.getDate() - (WEEKS * 7 - 1) - startDay.getDay());

    const g: { date: string; distance: number }[][] = [];
    const mLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      const week: { date: string; distance: number }[] = [];
      for (let d = 0; d < DAYS; d++) {
        const date = new Date(startDay);
        date.setDate(date.getDate() + w * 7 + d);
        const dateStr = date.toISOString().split('T')[0];
        const isFuture = date > today;

        if (date.getMonth() !== lastMonth && !isFuture) {
          lastMonth = date.getMonth();
          mLabels.push({ label: (date.getMonth() + 1) + '\uC6D4', col: w });
        }

        week.push({
          date: dateStr,
          distance: isFuture ? -1 : (dateMap.get(dateStr) || 0),
        });
      }
      g.push(week);
    }

    return { grid: g, monthLabels: mLabels, maxDistance: maxDist };
  }, [data]);

  const getColor = (distance: number): string => {
    if (distance < 0) return 'transparent'; // future
    if (distance === 0) return colors.surfaceLight;
    if (maxDistance === 0) return colors.surfaceLight;
    const ratio = distance / maxDistance;
    if (ratio < 0.25) return colors.primary + '30';
    if (ratio < 0.5) return colors.primary + '60';
    if (ratio < 0.75) return colors.primary + '99';
    return colors.primary;
  };

  return (
    <View>
      {/* Month labels */}
      <View style={[styles.monthRow, { marginLeft: 20 }]}>
        {monthLabels.map((m, i) => (
          <Text
            key={i}
            style={[styles.monthLabel, {
              color: colors.textTertiary,
              left: m.col * (CELL_SIZE + CELL_GAP),
            }]}
          >
            {m.label}
          </Text>
        ))}
      </View>

      <View style={styles.gridContainer}>
        {/* Day labels */}
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <Text
              key={i}
              style={[styles.dayLabel, {
                color: colors.textTertiary,
                height: CELL_SIZE,
                lineHeight: CELL_SIZE,
              }]}
            >
              {label}
            </Text>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {grid.map((week, w) => (
            <View key={w} style={styles.weekCol}>
              {week.map((day, d) => (
                <View
                  key={`${w}-${d}`}
                  style={[styles.cell, {
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: getColor(day.distance),
                    borderRadius: 3,
                  }]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Less</Text>
        {[colors.surfaceLight, colors.primary + '30', colors.primary + '60', colors.primary + '99', colors.primary].map((c, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', height: 16, position: 'relative', marginBottom: 2 },
  monthLabel: { position: 'absolute', fontSize: 10, fontWeight: '600' },
  gridContainer: { flexDirection: 'row' },
  dayLabels: { width: 18, gap: CELL_GAP },
  dayLabel: { fontSize: 10, fontWeight: '500', textAlign: 'right' },
  grid: { flexDirection: 'row', gap: CELL_GAP },
  weekCol: { gap: CELL_GAP },
  cell: {},
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: SPACING.sm,
  },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, fontWeight: '500' },
});
