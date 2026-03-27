import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  Switch,
  BackHandler,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

// ---- Types ----

export interface RunGoal {
  type: 'distance' | 'time' | 'pace' | 'program' | 'interval' | null;
  value: number | null; // meters for distance, seconds for time, seconds/km for pace, meters for program, total seconds for interval
  targetTime?: number | null; // program: target time in seconds
  cadenceBPM?: number | null; // program: metronome BPM (null/0 = off)
  intervalRunSeconds?: number; // interval: run phase duration
  intervalWalkSeconds?: number; // interval: walk phase duration
  intervalSets?: number; // interval: number of sets
}

interface RunGoalSheetProps {
  visible: boolean;
  onClose: () => void;
  goal: RunGoal;
  onGoalChange: (goal: RunGoal) => void;
}

// ---- Preset Data ----

const DISTANCE_PRESETS = [
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '21km', value: 21097 },
  { label: '42km', value: 42195 },
];

const PROGRAM_DISTANCE_PRESETS = [
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '21km', value: 21097 },
];

type GoalType = 'distance' | 'time' | 'program' | 'interval';

/** Build time presets with i18n labels */
function buildTimePresets(t: TFunction) {
  return [
    { label: `30${t('goal.minuteUnit')}`, value: 30 * 60 },
    { label: t('goal.timeFormatH', { h: 1 }), value: 60 * 60 },
    { label: `${t('goal.timeFormatH', { h: 1 })}30${t('goal.minuteUnit')}`, value: 90 * 60 },
    { label: t('goal.timeFormatH', { h: 2 }), value: 120 * 60 },
  ];
}

/** Build interval presets with i18n labels */
function buildIntervalRunPresets(fmt: (s: number) => string) {
  return [
    { label: fmt(30), value: 30 },
    { label: fmt(60), value: 60 },
    { label: fmt(120), value: 120 },
    { label: fmt(180), value: 180 },
    { label: fmt(300), value: 300 },
  ];
}

function buildIntervalWalkPresets(fmt: (s: number) => string) {
  return [
    { label: fmt(30), value: 30 },
    { label: fmt(60), value: 60 },
    { label: fmt(90), value: 90 },
    { label: fmt(120), value: 120 },
    { label: fmt(180), value: 180 },
  ];
}

const INTERVAL_SET_PRESETS = [3, 5, 7, 10];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_ANDROID = Platform.OS === 'android';

/** Format seconds as M'SS" pace string */
function formatPaceValue(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

/** Format seconds as human-readable time string (i18n-aware) */
function formatTimeInputI18n(totalSeconds: number, t: TFunction): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(t('goal.timeFormatH', { h }));
  if (m > 0) parts.push(t('goal.timeFormatM', { m }));
  if (s > 0) parts.push(t('goal.timeFormatS', { s }));
  return parts.length > 0 ? parts.join(' ') : t('goal.timeFormatZero');
}

/** Compute recommended BPM from pace (sec/km). Clamped 140-200. */
function computeRecommendedBPM(paceSecPerKm: number): number {
  // Empirical mapping: faster pace → higher cadence
  // ~150 BPM at 8:00/km, ~165 at 6:00/km, ~180 at 4:00/km
  const raw = Math.round(210 - paceSecPerKm / 8);
  return Math.max(140, Math.min(200, raw));
}

// ---- Wheel Picker ----

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 3;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = WHEEL_ITEM_H * 1;

const HOURS_RANGE = Array.from({ length: 6 }, (_, i) => i); // 0-5
const MINUTES_RANGE = Array.from({ length: 60 }, (_, i) => i); // 0-59
const SECONDS_RANGE = Array.from({ length: 60 }, (_, i) => i); // 0-59

const WheelPicker = React.memo(function WheelPicker({
  values,
  selected,
  onSelect,
  label,
  colors,
}: {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  label: string;
  colors: ThemeColors;
}) {
  const scrollRef = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const isUserScroll = useRef(false);
  const lastHapticIdx = useRef(-1);
  const lastHapticTime = useRef(0);

  // Sync scroll position when selected changes externally (reset, restore)
  useEffect(() => {
    if (!isUserScroll.current) {
      const idx = values.indexOf(selected);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: idx * WHEEL_ITEM_H, animated: false });
        });
      }
    }
    isUserScroll.current = false;
  }, [selected, values]);

  // Haptic feedback — throttled to max once per 80ms to avoid bridge saturation
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const idx = Math.round(value / WHEEL_ITEM_H);
      if (idx !== lastHapticIdx.current && idx >= 0 && idx < values.length) {
        lastHapticIdx.current = idx;
        const now = Date.now();
        if (now - lastHapticTime.current >= 80) {
          lastHapticTime.current = now;
          Haptics.selectionAsync();
        }
      }
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, values.length]);

  // Animated scroll handler — drives per-item opacity/scale on native thread
  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      ),
    [scrollY],
  );

  const handleScrollEnd = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / WHEEL_ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      if (values[clamped] !== selected) {
        isUserScroll.current = true;
        onSelect(values[clamped]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [values, selected, onSelect],
  );

  // Per-item animated opacity + scale (fades edges, enlarges center)
  const itemAnims = useMemo(
    () =>
      values.map((_, i) => {
        const c = i * WHEEL_ITEM_H;
        return {
          opacity: scrollY.interpolate({
            inputRange: [c - WHEEL_ITEM_H * 2, c - WHEEL_ITEM_H, c, c + WHEEL_ITEM_H, c + WHEEL_ITEM_H * 2],
            outputRange: [0.1, 0.35, 1, 0.35, 0.1],
            extrapolate: 'clamp',
          }),
          scale: scrollY.interpolate({
            inputRange: [c - WHEEL_ITEM_H * 2, c - WHEEL_ITEM_H, c, c + WHEEL_ITEM_H, c + WHEEL_ITEM_H * 2],
            outputRange: [0.75, 0.88, 1.08, 0.88, 0.75],
            extrapolate: 'clamp',
          }),
        };
      }),
    [scrollY, values],
  );

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontSize: FONT_SIZES.xs,
          fontWeight: '700',
          color: colors.textSecondary,
          marginBottom: SPACING.xs,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          height: WHEEL_H,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          width: '100%',
        }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScrollEnd}
          overScrollMode="never"
          bounces={false}
          nestedScrollEnabled={true}
        >
          {values.map((v, i) => (
            <Animated.View
              key={v}
              style={{
                height: WHEEL_ITEM_H,
                justifyContent: 'center',
                alignItems: 'center',
                opacity: itemAnims[i].opacity,
                transform: [{ scale: itemAnims[i].scale }],
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {String(v).padStart(2, '0')}
              </Text>
            </Animated.View>
          ))}
        </Animated.ScrollView>
        {/* Center selection highlight */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: WHEEL_PAD,
            left: 5,
            right: 5,
            height: WHEEL_ITEM_H,
            borderRadius: 10,
            backgroundColor: colors.primary + '08',
            borderWidth: 1,
            borderColor: colors.primary + '20',
          }}
        />
      </View>
    </View>
  );
});

// ---- Component ----

export default function RunGoalSheet({
  visible,
  onClose,
  goal,
  onGoalChange,
}: RunGoalSheetProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // i18n-aware format helper
  const formatTimeInput = useCallback((secs: number) => formatTimeInputI18n(secs, t), [t]);

  // Localized presets (rebuilt when language changes)
  const GOAL_TYPES = useMemo<Array<{ type: GoalType; label: string; icon: string }>>(() => [
    { type: 'distance', label: t('goal.distance'), icon: 'flag-outline' },
    { type: 'time', label: t('goal.time'), icon: 'timer-outline' },
    { type: 'program', label: t('goal.programRun'), icon: 'trophy-outline' },
    { type: 'interval', label: t('goal.interval'), icon: 'repeat-outline' },
  ], [t]);
  const TIME_PRESETS = useMemo(() => buildTimePresets(t), [t]);
  const INTERVAL_RUN_PRESETS = useMemo(() => buildIntervalRunPresets(formatTimeInput), [formatTimeInput]);
  const INTERVAL_WALK_PRESETS = useMemo(() => buildIntervalWalkPresets(formatTimeInput), [formatTimeInput]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const isClosingRef = useRef(false);

  // Derive overlay opacity from sheet position — synced so no "extra layer" flash
  const overlayOpacity = useMemo(
    () => slideAnim.interpolate({ inputRange: [0, SCREEN_HEIGHT], outputRange: [1, 0] }),
    [slideAnim],
  );
  const [androidShowSheet, setAndroidShowSheet] = useState(false);

  // Animate out then call onClose — prevents instant disappearance
  const animateClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false;
      if (IS_ANDROID) setAndroidShowSheet(false);
      onClose();
    });
  }, [slideAnim, onClose]);

  // Local state for editing before confirming
  // Filter out legacy 'pace' type (removed from UI)
  const toGoalType = (t: string | null | undefined): GoalType | null =>
    t === 'distance' || t === 'time' || t === 'program' || t === 'interval' ? t : null;
  const [selectedType, setSelectedType] = useState<GoalType | null>(toGoalType(goal.type));
  const [selectedValue, setSelectedValue] = useState<number | null>(goal.value);
  const [customInput, setCustomInput] = useState('');

  // Interval-specific local state
  const [intervalRunSec, setIntervalRunSec] = useState(goal.type === 'interval' ? (goal.intervalRunSeconds ?? 180) : 180);
  const [intervalWalkSec, setIntervalWalkSec] = useState(goal.type === 'interval' ? (goal.intervalWalkSeconds ?? 60) : 60);
  const [intervalSets, setIntervalSets] = useState(goal.type === 'interval' ? (goal.intervalSets ?? 5) : 5);

  // Program-specific local state
  const [programDistance, setProgramDistance] = useState<number | null>(
    goal.type === 'program' ? goal.value : null,
  );
  const [programDistanceCustom, setProgramDistanceCustom] = useState('');
  const [programTimeHours, setProgramTimeHours] = useState(0);
  const [programTimeMinutes, setProgramTimeMinutes] = useState(0);
  const [programTimeSeconds, setProgramTimeSeconds] = useState(0);
  const [selectedCadence, setSelectedCadence] = useState<number>(
    goal.type === 'program' ? (goal.cadenceBPM ?? 0) : 0,
  );
  const [manualBpmInput, setManualBpmInput] = useState('');

  // Sync local state when goal prop changes
  useEffect(() => {
    setSelectedType(toGoalType(goal.type));
    setSelectedValue(goal.value);
    setCustomInput('');
    if (goal.type === 'interval') {
      setIntervalRunSec(goal.intervalRunSeconds ?? 180);
      setIntervalWalkSec(goal.intervalWalkSeconds ?? 60);
      setIntervalSets(goal.intervalSets ?? 5);
    }
    if (goal.type === 'program') {
      setProgramDistance(goal.value);
      setProgramDistanceCustom(
        goal.value && !PROGRAM_DISTANCE_PRESETS.some((p) => p.value === goal.value)
          ? String(goal.value / 1000)
          : '',
      );
      const t = goal.targetTime ?? 0;
      setProgramTimeHours(t > 0 ? Math.floor(t / 3600) : 0);
      setProgramTimeMinutes(t > 0 ? Math.floor((t % 3600) / 60) : 0);
      setProgramTimeSeconds(t > 0 ? t % 60 : 0);
      setSelectedCadence(goal.cadenceBPM ?? 0);
      setManualBpmInput(goal.cadenceBPM && goal.cadenceBPM > 0 ? String(goal.cadenceBPM) : '');
    }
  }, [goal.type, goal.value, goal.targetTime, goal.cadenceBPM]);

  // Animate in / reset on close
  useEffect(() => {
    if (visible) {
      if (IS_ANDROID) setAndroidShowSheet(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      isClosingRef.current = false;
    }
  }, [visible, slideAnim]);

  // Android back button (replaces Modal's onRequestClose)
  useEffect(() => {
    if (!IS_ANDROID || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, animateClose]);

  const handleTypeSelect = (type: GoalType) => {
    if (selectedType === type) {
      setSelectedType(null);
      setSelectedValue(null);
    } else {
      setSelectedType(type);
      setSelectedValue(null);
      if (type === 'program') {
        setProgramDistance(null);
        setProgramDistanceCustom('');
        setProgramTimeHours(0);
        setProgramTimeMinutes(0);
        setProgramTimeSeconds(0);
        setSelectedCadence(0);
        setManualBpmInput('');
        setIsAutoCadence(true);
      }
      if (type === 'interval') {
        setIntervalRunSec(180);
        setIntervalWalkSec(60);
        setIntervalSets(5);
        }
    }
    setCustomInput('');
  };

  const handlePresetSelect = (value: number) => {
    setSelectedValue(value);
    setCustomInput('');
  };

  const handleCustomSubmit = () => {
    if (!customInput || !selectedType) return;
    const num = parseFloat(customInput);
    if (isNaN(num) || num <= 0) return;

    let value: number;
    switch (selectedType) {
      case 'distance':
        value = num * 1000;
        break;
      case 'time':
        value = num * 60;
        break;
      default:
        return;
    }
    setSelectedValue(value);
  };

  const handleManualBpmSubmit = useCallback(() => {
    const num = parseInt(manualBpmInput, 10);
    if (!isNaN(num) && num >= 100 && num <= 220) {
      setSelectedCadence(num);
      setIsAutoCadence(false);
    }
  }, [manualBpmInput]);

  const handleReset = () => {
    setSelectedType(null);
    setSelectedValue(null);
    setCustomInput('');
    setProgramDistance(null);
    setProgramDistanceCustom('');
    setProgramTimeHours(0);
    setProgramTimeMinutes(0);
    setProgramTimeSeconds(0);
    setSelectedCadence(0);
    setManualBpmInput('');
    setIsAutoCadence(true);
    setIntervalRunSec(180);
    setIntervalWalkSec(60);
    setIntervalSets(5);
    onGoalChange({ type: null, value: null, targetTime: null, cadenceBPM: null });
  };

  const handleConfirm = () => {
    if (selectedType === 'interval') {
      const totalSecs = (intervalRunSec + intervalWalkSec) * intervalSets;
      onGoalChange({
        type: 'interval',
        value: totalSecs,
        targetTime: null,
        cadenceBPM: null,
        intervalRunSeconds: intervalRunSec,
        intervalWalkSeconds: intervalWalkSec,
        intervalSets,
      });
    } else if (selectedType === 'program') {
      const totalSecs = programTimeHours * 3600 + programTimeMinutes * 60 + programTimeSeconds;
      onGoalChange({
        type: 'program',
        value: programDistance,
        targetTime: totalSecs > 0 ? totalSecs : null,
        cadenceBPM: selectedCadence > 0 ? selectedCadence : null,
      });
    } else {
      onGoalChange({
        type: selectedType,
        value: selectedValue,
        targetTime: null,
        cadenceBPM: null,
      });
    }
    animateClose();
  };

  const getCustomPlaceholder = (): string => {
    switch (selectedType) {
      case 'distance': return '7.5';
      case 'time': return '45';
      default: return '';
    }
  };

  const getCustomUnit = (): string => {
    switch (selectedType) {
      case 'distance': return 'km';
      case 'time': return t('goal.minuteUnit');
      default: return '';
    }
  };

  const getPresets = () => {
    switch (selectedType) {
      case 'distance': return DISTANCE_PRESETS;
      case 'time': return TIME_PRESETS;
      default: return [];
    }
  };

  // Compute required pace for program mode
  const programTargetTime = programTimeHours * 3600 + programTimeMinutes * 60 + programTimeSeconds;
  const computedPace = programDistance && programDistance > 0 && programTargetTime > 0
    ? programTargetTime / (programDistance / 1000)
    : null;

  const isProgramComplete = selectedType === 'program' && programDistance && programDistance > 0 && programTargetTime > 0;

  // Auto-set BPM from computed pace when distance+time are both set
  const recommendedBPM = computedPace ? computeRecommendedBPM(computedPace) : null;
  const [isAutoCadence, setIsAutoCadence] = useState(true);

  useEffect(() => {
    if (recommendedBPM && isAutoCadence && selectedType === 'program') {
      setSelectedCadence(recommendedBPM);
    }
  }, [recommendedBPM, isAutoCadence, selectedType]);

  const sheetInner = (
    <KeyboardAvoidingView
      style={styles.modalRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.gestureRoot}>
        {/* Full-screen overlay — outside dismissArea so it covers behind the sheet too */}
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none" />

        {/* Dismiss area (touch target only, no background) */}
        <Pressable style={styles.dismissArea} onPress={animateClose} />

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('goal.title')}</Text>
            <Pressable onPress={animateClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Goal type selector */}
          <View style={styles.typeRow}>
            {GOAL_TYPES.map(({ type, label, icon }) => {
              const isSelected = selectedType === type;
              return (
                <Pressable
                  key={type}
                  style={[
                    styles.typeCard,
                    isSelected && styles.typeCardSelected,
                  ]}
                  android_ripple={{ color: colors.surfaceLight, foreground: true }}
                  onPress={() => handleTypeSelect(type)}
                >
                  <Ionicons
                    name={icon as any}
                    size={22}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      isSelected && styles.typeLabelSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="always"
          >
            {/* Simple goal types: distance/time */}
            {selectedType && selectedType !== 'program' && selectedType !== 'interval' && (
              <View style={styles.valueSection}>
                <View style={styles.presetRow}>
                  {getPresets().map((preset) => {
                    const isActive = selectedValue === preset.value && !customInput;
                    return (
                      <Pressable
                        key={preset.value}
                        style={[
                          styles.presetChip,
                          isActive && styles.presetChipActive,
                        ]}
                        android_ripple={{ color: colors.surfaceLight, foreground: true }}
                        onPress={() => handlePresetSelect(preset.value)}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isActive && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.customRow}>
                  <View style={styles.customInputWrap}>
                    <TextInput
                      style={styles.customInput}
                      placeholder={getCustomPlaceholder()}
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                      value={customInput}
                      onChangeText={setCustomInput}
                      onSubmitEditing={handleCustomSubmit}
                      returnKeyType="done"
                    />
                    <Text style={styles.customUnit}>{getCustomUnit()}</Text>
                  </View>
                  <Pressable
                    style={[
                      styles.customConfirmBtn,
                      !customInput && styles.customConfirmBtnDisabled,
                    ]}
                    android_ripple={{ color: colors.surfaceLight, foreground: true }}
                    onPress={handleCustomSubmit}
                    disabled={!customInput}
                  >
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={customInput ? colors.white : colors.textTertiary}
                    />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Program goal type: distance + time + cadence */}
            {selectedType === 'program' && (
              <View style={styles.valueSection}>
                {/* ① Target distance */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>1</Text></View>
                    <Ionicons name="flag-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>{t('goal.targetDistance')}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {PROGRAM_DISTANCE_PRESETS.map((preset) => {
                      const isActive = programDistance === preset.value && !programDistanceCustom;
                      return (
                        <Pressable
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          android_ripple={{ color: colors.surfaceLight, foreground: true }}
                          onPress={() => {
                            setProgramDistance(preset.value);
                            setProgramDistanceCustom('');
                          }}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.pgCustomRow}>
                    <View style={styles.pgCustomInputWrap}>
                      <TextInput
                        style={styles.pgCustomInput}
                        keyboardType="decimal-pad"
                        value={programDistanceCustom}
                        onChangeText={(v) => {
                          const cleaned = v.replace(/[^0-9.]/g, '');
                          setProgramDistanceCustom(cleaned);
                          const km = parseFloat(cleaned);
                          if (!isNaN(km) && km > 0) {
                            setProgramDistance(Math.round(km * 1000));
                          }
                        }}
                        placeholder={t('goal.customInput')}
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.pgCustomUnit}>km</Text>
                    </View>
                  </View>
                </View>

                {/* ② Target time — wheel picker */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>2</Text></View>
                    <Ionicons name="timer-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>{t('goal.targetTime')}</Text>
                    {programTargetTime > 0 && (
                      <Text style={styles.pgTimeTag}>
                        {formatTimeInput(programTargetTime)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.pgWheelRow}>
                    <WheelPicker
                      values={HOURS_RANGE}
                      selected={programTimeHours}
                      onSelect={setProgramTimeHours}
                      label={t('goal.hoursLabel')}
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={MINUTES_RANGE}
                      selected={programTimeMinutes}
                      onSelect={setProgramTimeMinutes}
                      label={t('goal.minutesLabel')}
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={SECONDS_RANGE}
                      selected={programTimeSeconds}
                      onSelect={setProgramTimeSeconds}
                      label={t('goal.secondsLabel')}
                      colors={colors}
                    />
                  </View>
                  {/* Computed pace banner */}
                  {computedPace && (
                    <View style={styles.pgPaceBanner}>
                      <View style={styles.pgPaceItem}>
                        <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
                        <View>
                          <Text style={styles.pgPaceLabel}>{t('goal.requiredPace')}</Text>
                          <Text style={styles.pgPaceValue}>{formatPaceValue(computedPace)} /km</Text>
                        </View>
                      </View>
                      {recommendedBPM && (
                        <View style={styles.pgPaceItem}>
                          <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
                          <View>
                            <Text style={styles.pgPaceLabel}>{t('goal.recommendedBPM')}</Text>
                            <Text style={styles.pgPaceValue}>{recommendedBPM}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* ③ Cadence metronome */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>3</Text></View>
                    <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>{t('goal.metronome')}</Text>
                    {isAutoCadence && recommendedBPM ? (
                      <Text style={styles.pgAutoTag}>{t('goal.auto')}</Text>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Switch
                      value={selectedCadence > 0}
                      onValueChange={(on) => {
                        if (on) {
                          if (recommendedBPM) {
                            setSelectedCadence(recommendedBPM);
                            setIsAutoCadence(true);
                          } else {
                            const manual = parseInt(manualBpmInput, 10);
                            setSelectedCadence(manual >= 100 && manual <= 220 ? manual : 170);
                            setManualBpmInput(manual >= 100 && manual <= 220 ? String(manual) : '170');
                            setIsAutoCadence(false);
                          }
                        } else {
                          setSelectedCadence(0);
                          setIsAutoCadence(false);
                        }
                      }}
                      trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {selectedCadence > 0 && recommendedBPM && isAutoCadence && (
                    <View style={styles.pgBpmDisplay}>
                      <Text style={styles.pgBpmBig}>{selectedCadence}</Text>
                      <Text style={styles.pgBpmUnit}>BPM</Text>
                      <Text style={styles.pgBpmSub}>{t('goal.recommendedCadenceAuto')}</Text>
                    </View>
                  )}
                  {selectedCadence > 0 && !isAutoCadence && (
                    <View style={styles.pgBpmManualRow}>
                      <TextInput
                        style={styles.pgBpmInput}
                        placeholder="100 ~ 220"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="number-pad"
                        value={manualBpmInput}
                        onChangeText={(v) => {
                          setManualBpmInput(v);
                          const num = parseInt(v, 10);
                          if (!isNaN(num) && num >= 100 && num <= 220) {
                            setSelectedCadence(num);
                          }
                        }}
                        onSubmitEditing={handleManualBpmSubmit}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.pgBpmInputUnit}>BPM</Text>
                    </View>
                  )}
                  {selectedCadence === 0 && (
                    <Text style={styles.pgMetronomeHint}>{t('goal.metronomeHint')}</Text>
                  )}
                </View>

                {/* Summary banner */}
                {isProgramComplete && (
                  <View style={styles.pgSummary}>
                    <Text style={styles.pgSummaryText}>
                      {(programDistance! / 1000).toFixed(1)}km · {formatTimeInput(programTargetTime)} · {formatPaceValue(computedPace!)} /km
                      {selectedCadence > 0 ? ` · ${selectedCadence} BPM` : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Interval goal type: run time + walk time + sets */}
            {selectedType === 'interval' && (
              <View style={styles.valueSection}>
                {/* ① Run duration — chip-only */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={[styles.ivIcon, { backgroundColor: colors.primary + '20' }]}>
                      <Ionicons name="flash" size={13} color={colors.primary} />
                    </View>
                    <Text style={styles.pgHeaderText}>{t('goal.run')}</Text>
                    <Text style={styles.ivSelectedTag}>{formatTimeInput(intervalRunSec)}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_RUN_PRESETS.map((preset) => {
                      const isActive = intervalRunSec === preset.value;
                      return (
                        <Pressable
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          android_ripple={{ color: colors.surfaceLight, foreground: true }}
                          onPress={() => setIntervalRunSec(preset.value)}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* ② Walk duration — chip-only */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={[styles.ivIcon, { backgroundColor: '#10B98120' }]}>
                      <Ionicons name="walk" size={13} color="#10B981" />
                    </View>
                    <Text style={styles.pgHeaderText}>{t('goal.walk')}</Text>
                    <Text style={styles.ivSelectedTag}>{formatTimeInput(intervalWalkSec)}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_WALK_PRESETS.map((preset) => {
                      const isActive = intervalWalkSec === preset.value;
                      return (
                        <Pressable
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          android_ripple={{ color: colors.surfaceLight, foreground: true }}
                          onPress={() => setIntervalWalkSec(preset.value)}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* ③ Number of sets — chip-only */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={[styles.ivIcon, { backgroundColor: 'rgba(142,142,147,0.15)' }]}>
                      <Ionicons name="repeat" size={13} color="#8E8E93" />
                    </View>
                    <Text style={styles.pgHeaderText}>{t('goal.repeat')}</Text>
                    <Text style={styles.ivSelectedTag}>{t('goal.setsLabel', { count: intervalSets })}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_SET_PRESETS.map((n) => {
                      const isActive = intervalSets === n;
                      return (
                        <Pressable
                          key={n}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          android_ripple={{ color: colors.surfaceLight, foreground: true }}
                          onPress={() => setIntervalSets(n)}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {t('goal.setsLabel', { count: n })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Timeline visualization + summary */}
                {intervalRunSec > 0 && intervalWalkSec > 0 && intervalSets > 0 && (
                  <View style={styles.ivTimeline}>
                    {/* Visual blocks showing run/walk ratio */}
                    <View style={styles.ivTimelineBar}>
                      {Array.from({ length: Math.min(intervalSets, 8) }).map((_, i) => {
                        const total = intervalRunSec + intervalWalkSec;
                        const runRatio = intervalRunSec / total;
                        return (
                          <View key={i} style={styles.ivTimelineSet}>
                            <View style={[styles.ivTimelineBlock, { flex: runRatio, backgroundColor: colors.primary }]} />
                            <View style={[styles.ivTimelineBlock, { flex: 1 - runRatio, backgroundColor: '#10B981' }]} />
                          </View>
                        );
                      })}
                      {intervalSets > 8 && (
                        <Text style={styles.ivTimelineMore}>+{intervalSets - 8}</Text>
                      )}
                    </View>
                    <View style={styles.ivTimelineLegend}>
                      <View style={styles.ivLegendItem}>
                        <View style={[styles.ivLegendDot, { backgroundColor: colors.primary }]} />
                        <Text style={styles.ivLegendText}>{t('goal.run')} {formatTimeInput(intervalRunSec)}</Text>
                      </View>
                      <View style={styles.ivLegendItem}>
                        <View style={[styles.ivLegendDot, { backgroundColor: '#10B981' }]} />
                        <Text style={styles.ivLegendText}>{t('goal.walk')} {formatTimeInput(intervalWalkSec)}</Text>
                      </View>
                    </View>
                    <Text style={styles.ivTotalTime}>
                      {t('goal.totalTime', { time: formatTimeInput((intervalRunSec + intervalWalkSec) * intervalSets) })}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Bottom buttons */}
          <View style={styles.bottomRow}>
            <Pressable
              style={styles.resetButton}
              android_ripple={{ color: colors.surfaceLight, foreground: true }}
              onPress={handleReset}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.resetText}>{t('goal.reset')}</Text>
            </Pressable>

            <Pressable
              style={styles.confirmButton}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', foreground: true }}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>{t('goal.confirm')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );

  // Android: absolute overlay (no Dialog = no touch desync)
  // iOS: native Modal (proper UIViewController)
  if (IS_ANDROID) {
    if (!androidShowSheet) return null;
    return (
      <View style={styles.androidRoot}>
        {sheetInner}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={animateClose}>
      {sheetInner}
    </Modal>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    androidRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    gestureRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    dismissArea: {
      flex: 1,
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.xl,
      paddingBottom: Platform.OS === 'ios' ? 40 : 60,
      maxHeight: SCREEN_HEIGHT * 0.85,
      ...SHADOWS.lg,
    },
    handleBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.surfaceLight,
      alignSelf: 'center',
      marginTop: SPACING.md,
      marginBottom: SPACING.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xxl,
    },
    title: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
    },

    // Goal type selector
    typeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.xxl,
    },
    typeCard: {
      flex: 1,
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.transparent,
    },
    typeCardSelected: {
      borderColor: c.primary,
      backgroundColor: c.surface,
    },
    typeLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    typeLabelSelected: {
      color: c.primary,
      fontWeight: '700',
    },

    // Scrollable content area
    scrollContent: {
      flexGrow: 0,
    },

    // Value picker section
    valueSection: {
      gap: SPACING.md,
      marginBottom: SPACING.xl,
    },
    sectionLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      marginTop: SPACING.xs,
    },
    // ---- Program sections ----
    pgSection: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    pgHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    pgBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pgBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    pgHeaderText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      flexShrink: 0,
    },
    pgAutoTag: {
      fontSize: FONT_SIZES.xs - 1,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primary + '18',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    pgChipRow: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: SPACING.xs,
    },
    pgChip: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pgChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    pgChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
    },
    pgChipTextActive: {
      color: '#FFFFFF',
    },
    pgChipSmall: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pgChipSmallText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    // Wheel picker row
    pgWheelRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    pgWheelSep: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.textTertiary,
      marginTop: 24,
    },
    pgTimeTag: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primary + '15',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
      marginLeft: 'auto',
    },
    // Custom distance input
    pgCustomRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pgCustomInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: SPACING.md,
    },
    pgCustomInput: {
      flex: 1,
      height: 42,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
      textAlign: 'right',
      paddingHorizontal: 4,
    },
    pgCustomUnit: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textSecondary,
      marginLeft: 4,
    },
    // Interval UI
    ivIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ivSelectedTag: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primary + '15',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
      marginLeft: 'auto',
    },
    ivTimeline: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    ivTimelineBar: {
      flexDirection: 'row',
      gap: 3,
      height: 24,
      borderRadius: 6,
      overflow: 'hidden',
    },
    ivTimelineSet: {
      flex: 1,
      flexDirection: 'row',
      borderRadius: 4,
      overflow: 'hidden',
    },
    ivTimelineBlock: {
      height: '100%',
    },
    ivTimelineMore: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textTertiary,
      alignSelf: 'center',
      marginLeft: 4,
    },
    ivTimelineLegend: {
      flexDirection: 'row',
      gap: SPACING.xl,
      justifyContent: 'center',
    },
    ivLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    ivLegendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    ivLegendText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    ivTotalTime: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.primary,
      textAlign: 'center',
    },
    // Computed pace banner
    pgPaceBanner: {
      flexDirection: 'row',
      backgroundColor: c.primary + '12',
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      gap: SPACING.xl,
    },
    pgPaceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    pgPaceLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textSecondary,
    },
    pgPaceValue: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.primary,
    },
    // Metronome BPM display
    pgBpmDisplay: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
      gap: 2,
    },
    pgBpmBig: {
      fontSize: 32,
      fontWeight: '800',
      color: c.primary,
    },
    pgBpmUnit: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    pgBpmSub: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      marginTop: 2,
    },
    pgBpmManualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    pgBpmInput: {
      flex: 1,
      height: 44,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.card,
      paddingHorizontal: SPACING.lg,
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
      borderWidth: 1.5,
      borderColor: c.border,
      textAlign: 'center',
    },
    pgBpmInputUnit: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textSecondary,
    },
    pgMetronomeHint: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      textAlign: 'center',
    },
    // Summary
    pgSummary: {
      backgroundColor: c.primary + '10',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.primary + '30',
    },
    pgSummaryText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    presetChip: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    presetChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    presetChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
    },
    presetChipTextActive: {
      color: c.white,
    },

    // Custom input
    customRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      alignItems: 'center',
    },
    customInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: SPACING.md,
    },
    customInput: {
      flex: 1,
      height: 42,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
      textAlign: 'right',
      paddingHorizontal: 4,
    },
    customUnit: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textSecondary,
      marginLeft: 4,
    },
    customConfirmBtn: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    customConfirmBtnDisabled: {
      backgroundColor: c.surfaceLight,
    },


    // Bottom buttons
    bottomRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      alignItems: 'center',
      paddingTop: SPACING.md,
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
    },
    resetText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
    },
    confirmButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.md + 2,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary,
      ...SHADOWS.glow,
    },
    confirmText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.white,
    },
  });
