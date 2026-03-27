import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  Platform,
  PanResponder,
  Dimensions,
  BackHandler,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemeColors } from '../../utils/constants';
import type { RunEnvironment } from '../../stores/settingsStore';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;
const IS_ANDROID = Platform.OS === 'android';

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
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const dragOffset = useRef(new Animated.Value(0)).current;
  // Android uses state (triggers re-render to unmount overlay); iOS uses ref
  const [androidShowSheet, setAndroidShowSheet] = useState(false);
  const modalVisibleRef = useRef(false);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      modalVisibleRef.current = true;
      if (IS_ANDROID) setAndroidShowSheet(true);
      dragOffset.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    } else if (modalVisibleRef.current) {
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT,
        damping: 24,
        stiffness: 160,
        useNativeDriver: true,
      }).start(() => {
        modalVisibleRef.current = false;
        if (IS_ANDROID) setAndroidShowSheet(false);
      });
    }
  }, [visible, slideAnim, dragOffset]);

  // Android back button handler (replaces Modal's onRequestClose)
  useEffect(() => {
    if (!IS_ANDROID || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Pan responder for swipe-to-dismiss (only from handle area)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) {
            dragOffset.setValue(g.dy);
          }
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
            onClose();
          } else {
            Animated.spring(dragOffset, {
              toValue: 0,
              damping: 20,
              stiffness: 200,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [dragOffset, onClose],
  );

  // Settings store
  const runEnvironment = useSettingsStore((s) => s.runEnvironment);
  const setRunEnvironment = useSettingsStore((s) => s.setRunEnvironment);
  const autoPause = useSettingsStore((s) => s.autoPause);
  const setAutoPause = useSettingsStore((s) => s.setAutoPause);
  const voiceGuidance = useSettingsStore((s) => s.voiceGuidance);
  const setVoiceGuidance = useSettingsStore((s) => s.setVoiceGuidance);
  const countdownSeconds = useSettingsStore((s) => s.countdownSeconds);
  const setCountdownSeconds = useSettingsStore((s) => s.setCountdownSeconds);
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);

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
    setVoiceGuidance(!voiceGuidance);
  }, [voiceGuidance, setVoiceGuidance, tap]);

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
      label: t('runSettings.indoorOutdoor'),
      getValue: () => runEnvironment === 'outdoor' ? t('runSettings.outdoor') : t('runSettings.indoor'),
      onTap: cycleEnvironment,
    },
    {
      key: 'autopause',
      icon: 'pause',
      label: t('runSettings.autoPause'),
      getValue: () => autoPause ? t('runSettings.on') : t('runSettings.off'),
      onTap: cycleAutoPause,
    },
  ], [runEnvironment, autoPause, cycleEnvironment, cycleAutoPause, t]);

  const displayTiles: SettingTile[] = useMemo(() => [
    {
      key: 'voice',
      icon: voiceGuidance ? 'volume-high' : 'volume-mute',
      label: t('runSettings.voiceFeedback'),
      getValue: () => {
        return voiceGuidance ? t('runSettings.on') : t('runSettings.off');
      },
      onTap: cycleVoice,
    },
    {
      key: 'countdown',
      icon: 'timer-outline',
      label: t('runSettings.countdown'),
      getValue: () => t('runSettings.seconds', { count: countdownSeconds }),
      onTap: cycleCountdown,
    },
  ], [voiceGuidance, countdownSeconds, cycleVoice, cycleCountdown, t]);

  const deviceTiles: SettingTile[] = useMemo(() => [
    {
      key: 'hr',
      icon: 'heart',
      label: t('runSettings.heartRateDisplay'),
      getValue: () => t('runSettings.settings'),
      onTap: openHeartRate,
    },
    {
      key: 'watch',
      icon: 'watch-outline' as keyof typeof Ionicons.glyphMap,
      label: Platform.OS === 'ios' ? 'Apple Watch' : 'Galaxy Watch',
      getValue: () => t('runSettings.settings'),
      onTap: openWatch,
    },
  ], [openHeartRate, openWatch, t]);

  const renderTile = (tile: SettingTile) => (
    <Pressable
      key={tile.key}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={tile.onTap}
    >
      <Ionicons name={tile.icon} size={26} color={colors.text} />
      <Text style={styles.tileValue}>{tile.getValue()}</Text>
      <Text style={styles.tileLabel}>{tile.label}</Text>
    </Pressable>
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

  // Derive overlay opacity from combined position — synced so no "extra layer" flash
  const overlayOpacity = useMemo(
    () => combinedTranslateY.interpolate({ inputRange: [0, SCREEN_HEIGHT], outputRange: [1, 0], extrapolate: 'clamp' }),
    [combinedTranslateY],
  );

  const sheetContent = (
    <View style={styles.gestureRoot} pointerEvents="box-none">
      {/* Full-screen overlay — outside dismissArea so it covers behind the sheet too */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none" />

      {/* Dismiss area (touch target only) */}
      <Pressable style={styles.dismissArea} onPress={onClose} />

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: combinedTranslateY }] }]}>
        <View style={styles.handleBarArea} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        <View style={styles.scrollContent}>
          {renderSection(t('runSettings.sectionMeasure'), measureTiles)}
          {renderSection(t('runSettings.sectionDisplayVoice'), displayTiles)}
          {renderSection(t('runSettings.sectionDevice'), deviceTiles)}
        </View>
      </Animated.View>
    </View>
  );

  // Android: render as absolute overlay (no Dialog window = no touch desync)
  // iOS: use native Modal (proper UIViewController presentation)
  if (IS_ANDROID) {
    if (!androidShowSheet) return null;
    return (
      <View style={styles.androidRoot}>
        {sheetContent}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {sheetContent}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    androidRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },
    gestureRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    dismissArea: {
      flex: 1,
    },
    sheet: {
      maxHeight: '80%',
      backgroundColor: c.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingBottom: Platform.OS === 'ios' ? 40 : 60,
      ...SHADOWS.lg,
    },
    handleBarArea: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      alignItems: 'center',
    },
    handleBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.surfaceLight,
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
    tilePressed: {
      opacity: 0.6,
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
