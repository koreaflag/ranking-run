import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDistanceShort(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function ActivityHeatmap({ data }: Props) {
  const colors = useTheme();
  const [selectedDay, setSelectedDay] = useState<{ date: string; distance: number; runCount: number } | null>(null);

  const { grid, monthLabels, maxDistance, dateInfoMap } = useMemo(() => {
    // Build a map of date -> distance & run_count
    const dateMap = new Map<string, number>();
    const infoMap = new Map<string, { distance: number; runCount: number }>();
    let maxDist = 0;
    for (const d of data) {
      dateMap.set(d.date, d.distance_meters);
      infoMap.set(d.date, { distance: d.distance_meters, runCount: d.run_count });
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

    return { grid: g, monthLabels: mLabels, maxDistance: maxDist, dateInfoMap: infoMap };
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

  const handleCellPress = useCallback((date: string, distance: number) => {
    if (distance < 0) return; // future
    const info = dateInfoMap.get(date);
    if (selectedDay?.date === date) {
      setSelectedDay(null);
    } else {
      setSelectedDay({ date, distance, runCount: info?.runCount ?? 0 });
    }
  }, [dateInfoMap, selectedDay]);

  // Legend distance labels
  const legendLabels = useMemo(() => {
    if (maxDistance === 0) return { q1: '', q2: '', q3: '', q4: '' };
    return {
      q1: formatDistanceShort(Math.round(maxDistance * 0.25)),
      q4: formatDistanceShort(Math.round(maxDistance)),
    };
  }, [maxDistance]);

  return (
    <View>
      {/* Selected day tooltip */}
      {selectedDay && (
        <View style={[styles.tooltip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tooltipDate, { color: colors.text }]}>
            {formatDateLabel(selectedDay.date)}
          </Text>
          {selectedDay.distance > 0 ? (
            <Text style={[styles.tooltipValue, { color: colors.primary }]}>
              {formatDistanceShort(selectedDay.distance)} · {selectedDay.runCount}회
            </Text>
          ) : (
            <Text style={[styles.tooltipValue, { color: colors.textTertiary }]}>
              휴식
            </Text>
          )}
        </View>
      )}

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
                <TouchableOpacity
                  key={`${w}-${d}`}
                  activeOpacity={0.7}
                  onPress={() => handleCellPress(day.date, day.distance)}
                >
                  <View
                    style={[styles.cell, {
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      backgroundColor: getColor(day.distance),
                      borderRadius: 3,
                      borderWidth: selectedDay?.date === day.date ? 1.5 : 0,
                      borderColor: selectedDay?.date === day.date ? colors.text : 'transparent',
                    }]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Legend with distance labels */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>0</Text>
        {[colors.surfaceLight, colors.primary + '30', colors.primary + '60', colors.primary + '99', colors.primary].map((c, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>
          {maxDistance > 0 ? legendLabels.q4 : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    alignSelf: 'center',
  },
  tooltipDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipValue: {
    fontSize: 12,
    fontWeight: '600',
  },
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
