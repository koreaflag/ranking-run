import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING, BORDER_RADIUS, type ThemeColors } from '../../utils/constants';

export interface FilterChip {
  label: string;
  value: string | null;
}

export interface FilterGroup {
  key: string;
  chips: FilterChip[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}

interface Props {
  groups: FilterGroup[];
}

export default function FilterChipBar({ groups }: Props) {
  const colors = useTheme();
  const styles = createStyles(colors);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {groups.map((group, gi) => (
        <React.Fragment key={group.key}>
          {gi > 0 && <View style={styles.divider} />}
          {group.chips.map((chip) => {
            const isActive = group.selected === chip.value;
            return (
              <TouchableOpacity
                key={`${group.key}-${chip.value}`}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => group.onSelect(chip.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  chipActive: {
    backgroundColor: c.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: c.divider,
    marginHorizontal: SPACING.xs,
  },
});
