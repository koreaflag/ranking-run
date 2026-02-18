import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, SPACING } from '../../utils/constants';

interface StarRatingProps {
  rating: number;
  onRate?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

export default function StarRating({
  rating,
  onRate,
  size = 24,
  readonly = false,
}: StarRatingProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const stars = [1, 2, 3, 4, 5];
  const isInteractive = !readonly && onRate;

  return (
    <View style={styles.container}>
      {stars.map((star) => {
        const filled = star <= rating;

        if (isInteractive) {
          return (
            <TouchableOpacity
              key={star}
              onPress={() => onRate(star)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.star,
                  { fontSize: size },
                  filled ? styles.starFilled : styles.starEmpty,
                ]}
              >
                {filled ? '\u2605' : '\u2606'}
              </Text>
            </TouchableOpacity>
          );
        }

        return (
          <Text
            key={star}
            style={[
              styles.star,
              { fontSize: size },
              filled ? styles.starFilled : styles.starEmpty,
            ]}
          >
            {filled ? '\u2605' : '\u2606'}
          </Text>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  star: {
    lineHeight: undefined,
  },
  starFilled: {
    color: COLORS.warning,
  },
  starEmpty: {
    color: c.border,
  },
});
