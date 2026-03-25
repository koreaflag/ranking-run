import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  Platform,
  ScrollView,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemeColors } from '../../utils/constants';
import type { RunEnvironment } from '../../stores/settingsStore';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;

interface RunSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  onNavigateWatch?: () => void;
  onNavigateHeartRate?: () => void;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingTile {
  key: string;
  icon: IoniconsName;
  label: string;
  getValue: () => string;
  onTap: () => void;
}

export default function RunSettingsSheet({ visible, onClose, onNavigateWatch, onNavigateHeartRate }: RunSettingsSheetProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dragOffset = useRef(new Animated.Value(0)).current;
  const modalVisible = useRef(false);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      modalVisible.current = true;
      dragOffset.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (modalVisible.current) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        modalVisible.current = false;
      });
    }
  }, [visible, slideAnim, overlayOpacity, dragOffset]);

  // Track touch start position to restrict drag to handle area
  const touchStartYRef = useRef(0);
  const sheetTopRef = useRef(0);

  // Pan responder for swipe-to-dismiss (only from handle area)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          touchStartYRef.current = evt.nativeEvent.pageY;
          return false;
        },
        onMoveShouldSetPanResponder: (_, g) => {
          const touchInHandle = touchStartYRef.current - sheetTopRef.current < 48;
          return touchInHandle && g.dy > 8;
        },
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) {
            dragOffset.setValue(g.dy);
            // Fade overlay as user drags
            const progress = Math.min(g.dy / 300, 1);
            overlayOpacity.setValue(1 - progress * 0.6);
          }
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
            onClose();
          } else {
            Animated.parallel([
              Animated.spring(dragOffset, {
                toValue: 0,
                damping: 20,
                stiffness: 200,
                useNativeDriver: true,
              }),
              Animated.timing(overlayOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [dragOffset, overlayOpacity, onClose],
  );

  // Settings store
  const {
    runEnvironment, setRunEnvironment,
    autoPause, setAutoPause,
    voiceGuidance, setVoiceGuidance,
    voiceGender, setVoiceGender,
    countdownSeconds, setCountdownSeconds,
    hapticFeedback,
  } = useSettingsStore();

  const tap = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticFeedback]);

  const cycleEnvironment = useCallback(() => {
    tap();
    const next: RunEnvironment = runEnvironment === 'outdoor' ? 'indoor' : 'outdoor';
    setRunEnvironment(next);
  }, [runEnvironment, setRunEnvironment, tap]);

  const cycleAutoPause = useCallback(() => {
    tap();
    setAutoPause(!autoPause);
  }, [autoPause, setAutoPause, tap]);

  const cycleVoice = useCallback(() => {
    tap();
    if (!voiceGuidance) {
      setVoiceGuidance(true);
      return;
    }
    if (voiceGender === 'female') {
      setVoiceGender('male');
      return;
    }
    setVoiceGuidance(false);
    setVoiceGender('female');
  }, [voiceGuidance, voiceGender, setVoiceGuidance, setVoiceGender, tap]);

  const cycleCountdown = useCallback(() => {
    tap();
    const opts = [3, 5, 10];
    const idx = opts.indexOf(countdownSeconds);
    setCountdownSeconds(opts[(idx + 1) % opts.length]);
  }, [countdownSeconds, setCountdownSeconds, tap]);

  const openHeartRate = useCallback(() => {
    tap();
    onClose();
    setTimeout(() => onNavigateHeartRate?.(), 300);
  }, [tap, onClose, onNavigateHeartRate]);

  const openWatch = useCallback(() => {
    tap();
    onClose();
    setTimeout(() => onNavigateWatch?.(), 300);
  }, [tap, onClose, onNavigateWatch]);

  // Tile definitions
  const measureTiles: SettingTile[] = useMemo(() => [
    {
      key: 'env',
      icon: runEnvironment === 'outdoor' ? 'location' : 'business',
      label: '실내/실외',
      getValue: () => runEnvironment === 'outdoor' ? '실외' : '실내',
      onTap: cycleEnvironment,
    },
    {
      key: 'autopause',
      icon: 'pause',
      label: '자동 일시 정지',
      getValue: () => autoPause ? '켜기' : '끄기',
      onTap: cycleAutoPause,
    },
  ], [runEnvironment, autoPause, cycleEnvironment, cycleAutoPause]);

  const displayTiles: SettingTile[] = useMemo(() => [
    {
      key: 'voice',
      icon: voiceGuidance ? 'volume-high' : 'volume-mute',
      label: '음성 피드백',
      getValue: () => {
        if (!voiceGuidance) return '끄기';
        return `켜기 / ${voiceGender === 'female' ? '여성' : '남성'}`;
      },
      onTap: cycleVoice,
    },
    {
      key: 'countdown',
      icon: 'timer-outline',
      label: '카운트다운',
      getValue: () => `${countdownSeconds}초`,
      onTap: cycleCountdown,
    },
  ], [voiceGuidance, voiceGender, countdownSeconds, cycleVoice, cycleCountdown]);

  const deviceTiles: SettingTile[] = useMemo(() => [
    {
      key: 'hr',
      icon: 'heart',
      label: '심박수',
      getValue: () => '설정',
      onTap: openHeartRate,
    },
    {
      key: 'watch',
      icon: 'watch-outline' as keyof typeof Ionicons.glyphMap,
      label: Platform.OS === 'ios' ? 'Apple Watch' : 'Galaxy Watch',
      getValue: () => '설정',
      onTap: openWatch,
    },
  ], [openHeartRate, openWatch]);

  const renderTile = (tile: SettingTile) => (
    <TouchableOpacity
      key={tile.key}
      style={styles.tile}
      onPress={tile.onTap}
      activeOpacity={0.6}
    >
      <Ionicons name={tile.icon} size={26} color={colors.text} />
      <Text style={styles.tileValue}>{tile.getValue()}</Text>
      <Text style={styles.tileLabel}>{tile.label}</Text>
    </TouchableOpacity>
  );

  const renderSection = (title: string, tiles: SettingTile[]) => (
    <View key={title}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.tileGrid}>
        {tiles.map(renderTile)}
      </View>
    </View>
  );

  const combinedTranslateY = Animated.add(slideAnim, dragOffset);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Overlay — tap to dismiss */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      {/* Sheet — swipe down to dismiss */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: combinedTranslateY }] }]}
        onLayout={(e) => { sheetTopRef.current = e.nativeEvent.layout.y; }}
        {...panResponder.panHandlers}
      >
        {/* Handle bar (visual drag hint) */}
        <View style={styles.handleBar} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {renderSection('측정', measureTiles)}
          {renderSection('표시 및 음성', displayTiles)}
          {renderSection('기기', deviceTiles)}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '80%',
      backgroundColor: c.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingBottom: Platform.OS === 'ios' ? 40 : 60,
      ...SHADOWS.lg,
    },
    handleBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.surfaceLight,
      alignSelf: 'center',
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
    },
    scrollContent: {
      paddingBottom: SPACING.xxl,
    },

    // Section
    sectionHeader: {
      backgroundColor: c.surface,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xl,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
      textAlign: 'center',
    },

    // Tile grid
    tileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    tile: {
      width: '50%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xxl,
      gap: SPACING.sm,
    },
    tileValue: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      marginTop: SPACING.xs,
    },
    tileLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
  });
