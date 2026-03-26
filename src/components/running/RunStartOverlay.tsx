import { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, SHADOWS } from '../../utils/constants';

interface RunStartOverlayProps {
  onStart: () => void;
  onGoalPress: () => void;
  onSettingsPress?: () => void;
  goalLabel?: string;
  visible: boolean;
}

export default function RunStartOverlay({
  onStart,
  onGoalPress,
  onSettingsPress,
  goalLabel,
  visible,
}: RunStartOverlayProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const defaultGoalLabel = t('running.goalSetting');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const translateY = useRef(new Animated.Value(visible ? 0 : 120)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 120,
        damping: 18,
        stiffness: 160,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateY, opacity]);

  const hasGoal = goalLabel != null && goalLabel !== defaultGoalLabel && goalLabel !== t('world.goalSetting');

  const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

  return (
    <View style={styles.container} pointerEvents={visible ? 'box-none' : 'none'}>
      <Animated.View
        style={[
          styles.innerContainer,
          {
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        {/* Goal label chip — shown when a goal is set */}
        {hasGoal && (
          <TouchableOpacity style={styles.goalChip} onPress={onGoalPress} activeOpacity={0.7} hitSlop={hitSlop}>
            <Ionicons name="flag" size={14} color={colors.primary} />
            <Text style={styles.goalChipText} numberOfLines={1}>{goalLabel}</Text>
          </TouchableOpacity>
        )}

        {/* Main row: settings / start / goal */}
        <View style={styles.row}>
          {/* Settings button */}
          <TouchableOpacity
            style={styles.sideButton}
            onPress={onSettingsPress}
            activeOpacity={0.7}
            hitSlop={hitSlop}
          >
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Big start button */}
          <TouchableOpacity
            style={styles.startButton}
            onPress={onStart}
            activeOpacity={0.85}
          >
            <Text style={styles.startText}>{t('running.controls.start')}</Text>
          </TouchableOpacity>

          {/* Goal button */}
          <TouchableOpacity
            style={[styles.sideButton, hasGoal && styles.sideButtonActive]}
            onPress={onGoalPress}
            activeOpacity={0.7}
            hitSlop={hitSlop}
          >
            <Ionicons
              name={hasGoal ? 'flag' : 'flag-outline'}
              size={24}
              color={hasGoal ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 50,
      left: 0,
      right: 0,
      zIndex: 100,
    },
    innerContainer: {
      alignItems: 'center',
      gap: SPACING.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xxxl,
    },
    sideButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: c.card,
      justifyContent: 'center',
      alignItems: 'center',
      ...SHADOWS.md,
    },
    sideButtonActive: {
      borderWidth: 1.5,
      borderColor: c.primaryLight,
    },
    startButton: {
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 20,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    startText: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '900',
      color: COLORS.white,
      letterSpacing: 2,
    },
    goalChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: c.card,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: 20,
      ...SHADOWS.sm,
    },
    goalChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      maxWidth: 200,
    },
  });
