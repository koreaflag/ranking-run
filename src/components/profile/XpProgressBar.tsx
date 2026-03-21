import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { getRunnerTier, getRunnerXpProgress } from '../../utils/runnerLevelConfig';
import { metersToKm } from '../../utils/format';

type Props = {
  level: number;
  totalDistanceMeters: number;
};

export default function XpProgressBar({ level, totalDistanceMeters }: Props) {
  const { t } = useTranslation();
  const colors = useTheme();
  const tier = getRunnerTier(level);
  const xp = getRunnerXpProgress(level, totalDistanceMeters);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: xp.ratio,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [xp.ratio]);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.tierName, { color: tier.color }]}>{t(tier.nameKey)}</Text>
        <Text style={[styles.xpLabel, { color: colors.textTertiary }]}>
          {xp.isMax ? 'MAX' : `${metersToKm(xp.current, 1)} / ${metersToKm(xp.next, 0)}km`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: tier.color + '25' }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: tier.color,
              width: anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      gap: 4,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tierName: {
      fontSize: 12,
      fontWeight: '800',
    },
    xpLabel: {
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'] as const,
    },
    track: {
      height: 3,
      borderRadius: 1.5,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 1.5,
    },
  });
