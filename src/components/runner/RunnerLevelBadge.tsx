import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getRunnerTier } from '../../utils/runnerLevelConfig';
import { useTheme } from '../../hooks/useTheme';

type Size = 'sm' | 'md' | 'lg';

const SIZES = {
  sm: { height: 22, fontSize: 10, px: 6, radius: 6 },
  md: { height: 28, fontSize: 12, px: 8, radius: 8 },
  lg: { height: 36, fontSize: 14, px: 10, radius: 10 },
};

type Props = {
  level?: number;
  size?: Size;
};

export default function RunnerLevelBadge({ level, size = 'md' }: Props) {
  const lv = level ?? 1;
  const tier = getRunnerTier(lv);
  const colors = useTheme();
  const isDark = colors.statusBar === 'light-content';
  const s = SIZES[size];

  const bg = isDark ? tier.bgColor : tier.bgColorLight;
  const border = isDark ? tier.borderColor : tier.borderColorLight;
  const text = isDark ? tier.textColor : tier.textColorLight;

  return (
    <View
      style={[
        styles.badge,
        {
          height: s.height,
          paddingHorizontal: s.px,
          borderRadius: s.radius,
          backgroundColor: bg,
          borderColor: border,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: s.fontSize, color: text },
        ]}
      >
        Lv.{lv}
      </Text>
    </View>
  );
}

export { getRunnerTier };

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
