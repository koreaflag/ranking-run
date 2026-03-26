import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
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

const TIME_PRESETS = [
  { label: '30분', value: 30 * 60 },
  { label: '1시간', value: 60 * 60 },
  { label: '1시간30분', value: 90 * 60 },
  { label: '2시간', value: 120 * 60 },
];

const PACE_PRESETS = [
  { label: "5'00\"", value: 5 * 60 },
  { label: "5'30\"", value: 5 * 60 + 30 },
  { label: "6'00\"", value: 6 * 60 },
  { label: "6'30\"", value: 6 * 60 + 30 },
  { label: "7'00\"", value: 7 * 60 },
];

const PROGRAM_DISTANCE_PRESETS = [
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '21km', value: 21097 },
];

type GoalType = 'distance' | 'time' | 'pace' | 'program' | 'interval';

const GOAL_TYPES: Array<{ type: GoalType; label: string; icon: string }> = [
  { type: 'distance', label: '거리', icon: 'flag-outline' },
  { type: 'time', label: '시간', icon: 'timer-outline' },
  { type: 'pace', label: '페이스', icon: 'speedometer-outline' },
  { type: 'program', label: '목표 러닝', icon: 'trophy-outline' },
  { type: 'interval', label: '인터벌', icon: 'repeat-outline' },
];

const INTERVAL_RUN_PRESETS = [
  { label: '1분', value: 60 },
  { label: '2분', value: 120 },
  { label: '3분', value: 180 },
  { label: '5분', value: 300 },
];

const INTERVAL_WALK_PRESETS = [
  { label: '30초', value: 30 },
  { label: '1분', value: 60 },
  { label: '2분', value: 120 },
  { label: '3분', value: 180 },
];

const INTERVAL_SET_PRESETS = [3, 5, 8, 10];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Format seconds as M'SS" pace string */
function formatPaceValue(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

/** Format seconds as human-readable time string */
function formatTimeInput(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0) parts.push(`${s}초`);
  return parts.length > 0 ? parts.join(' ') : '0분';
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

function WheelPicker({
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

  // Haptic feedback via Animated.Value listener (reliable with native driver)
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const idx = Math.round(value / WHEEL_ITEM_H);
      if (idx !== lastHapticIdx.current && idx >= 0 && idx < values.length) {
        lastHapticIdx.current = idx;
        Haptics.selectionAsync();
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
}

// ---- Component ----

export default function RunGoalSheet({
  visible,
  onClose,
  goal,
  onGoalChange,
}: RunGoalSheetProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  // Animate out then call onClose — prevents instant disappearance
  const animateClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
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
      isClosingRef.current = false;
      onClose();
    });
  }, [slideAnim, overlayOpacity, onClose]);

  // Local state for editing before confirming
  const [selectedType, setSelectedType] = useState<GoalType | null>(goal.type);
  const [selectedValue, setSelectedValue] = useState<number | null>(goal.value);
  const [customInput, setCustomInput] = useState('');

  // Interval-specific local state
  const [intervalRunSec, setIntervalRunSec] = useState(goal.type === 'interval' ? (goal.intervalRunSeconds ?? 180) : 180);
  const [intervalWalkSec, setIntervalWalkSec] = useState(goal.type === 'interval' ? (goal.intervalWalkSeconds ?? 60) : 60);
  const [intervalSets, setIntervalSets] = useState(goal.type === 'interval' ? (goal.intervalSets ?? 5) : 5);
  const [intervalCustomSets, setIntervalCustomSets] = useState('');

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
    setSelectedType(goal.type);
    setSelectedValue(goal.value);
    setCustomInput('');
    if (goal.type === 'interval') {
      setIntervalRunSec(goal.intervalRunSeconds ?? 180);
      setIntervalWalkSec(goal.intervalWalkSeconds ?? 60);
      setIntervalSets(goal.intervalSets ?? 5);
      setIntervalCustomSets('');
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

  // Animate sheet
  useEffect(() => {
    if (visible) {
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
    } else {
      // Reset position instantly when closed (animateClose handles the animation)
      slideAnim.setValue(SCREEN_HEIGHT);
      overlayOpacity.setValue(0);
      isClosingRef.current = false;
    }
  }, [visible, slideAnim, overlayOpacity]);

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
        setIntervalCustomSets('');
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
      case 'pace':
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
    setIntervalCustomSets('');
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
    onClose();
  };

  const getCustomPlaceholder = (): string => {
    switch (selectedType) {
      case 'distance': return '7.5';
      case 'time': return '45';
      case 'pace': return '5.5';
      default: return '';
    }
  };

  const getCustomUnit = (): string => {
    switch (selectedType) {
      case 'distance': return 'km';
      case 'time': return '분';
      case 'pace': return "'/km";
      default: return '';
    }
  };

  const getPresets = () => {
    switch (selectedType) {
      case 'distance': return DISTANCE_PRESETS;
      case 'time': return TIME_PRESETS;
      case 'pace': return PACE_PRESETS;
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

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Overlay */}
        <Animated.View
          style={[styles.overlay, { opacity: overlayOpacity }]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={animateClose}
          />
        </Animated.View>

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
            <Text style={styles.title}>목표 설정</Text>
            <TouchableOpacity onPress={animateClose} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Goal type selector */}
          <View style={styles.typeRow}>
            {GOAL_TYPES.map(({ type, label, icon }) => {
              const isSelected = selectedType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    isSelected && styles.typeCardSelected,
                  ]}
                  onPress={() => handleTypeSelect(type)}
                  activeOpacity={0.7}
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
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Simple goal types: distance/time/pace */}
            {selectedType && selectedType !== 'program' && (
              <View style={styles.valueSection}>
                <View style={styles.presetRow}>
                  {getPresets().map((preset) => {
                    const isActive = selectedValue === preset.value && !customInput;
                    return (
                      <TouchableOpacity
                        key={preset.value}
                        style={[
                          styles.presetChip,
                          isActive && styles.presetChipActive,
                        ]}
                        onPress={() => handlePresetSelect(preset.value)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isActive && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
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
                  <TouchableOpacity
                    style={[
                      styles.customConfirmBtn,
                      !customInput && styles.customConfirmBtnDisabled,
                    ]}
                    onPress={handleCustomSubmit}
                    activeOpacity={0.7}
                    disabled={!customInput}
                  >
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={customInput ? colors.white : colors.textTertiary}
                    />
                  </TouchableOpacity>
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
                    <Text style={styles.pgHeaderText}>목표 거리</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {PROGRAM_DISTANCE_PRESETS.map((preset) => {
                      const isActive = programDistance === preset.value && !programDistanceCustom;
                      return (
                        <TouchableOpacity
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          onPress={() => {
                            setProgramDistance(preset.value);
                            setProgramDistanceCustom('');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
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
                        placeholder="직접 입력"
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
                    <Text style={styles.pgHeaderText}>목표 시간</Text>
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
                      label="시간"
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={MINUTES_RANGE}
                      selected={programTimeMinutes}
                      onSelect={setProgramTimeMinutes}
                      label="분"
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={SECONDS_RANGE}
                      selected={programTimeSeconds}
                      onSelect={setProgramTimeSeconds}
                      label="초"
                      colors={colors}
                    />
                  </View>
                  {/* Computed pace banner */}
                  {computedPace && (
                    <View style={styles.pgPaceBanner}>
                      <View style={styles.pgPaceItem}>
                        <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
                        <View>
                          <Text style={styles.pgPaceLabel}>필요 페이스</Text>
                          <Text style={styles.pgPaceValue}>{formatPaceValue(computedPace)} /km</Text>
                        </View>
                      </View>
                      {recommendedBPM && (
                        <View style={styles.pgPaceItem}>
                          <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
                          <View>
                            <Text style={styles.pgPaceLabel}>추천 BPM</Text>
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
                    <Text style={styles.pgHeaderText}>메트로놈</Text>
                    {isAutoCadence && recommendedBPM ? (
                      <Text style={styles.pgAutoTag}>자동</Text>
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
                      <Text style={styles.pgBpmSub}>추천 케이던스 (자동)</Text>
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
                    <Text style={styles.pgMetronomeHint}>달리는 동안 리듬에 맞춰 틱 소리가 울립니다</Text>
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
                {/* ① Run duration */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>1</Text></View>
                    <Ionicons name="flash-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>달리기 시간</Text>
                    <Text style={styles.pgTimeTag}>{formatTimeInput(intervalRunSec)}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_RUN_PRESETS.map((preset) => {
                      const isActive = intervalRunSec === preset.value;
                      return (
                        <TouchableOpacity
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          onPress={() => setIntervalRunSec(preset.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.pgWheelRow}>
                    <WheelPicker
                      values={MINUTES_RANGE}
                      selected={Math.floor(intervalRunSec / 60)}
                      onSelect={(m) => setIntervalRunSec(m * 60 + (intervalRunSec % 60))}
                      label="분"
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={SECONDS_RANGE}
                      selected={intervalRunSec % 60}
                      onSelect={(s) => setIntervalRunSec(Math.floor(intervalRunSec / 60) * 60 + s)}
                      label="초"
                      colors={colors}
                    />
                  </View>
                </View>

                {/* ② Walk duration */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>2</Text></View>
                    <Ionicons name="walk-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>걷기 시간</Text>
                    <Text style={styles.pgTimeTag}>{formatTimeInput(intervalWalkSec)}</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_WALK_PRESETS.map((preset) => {
                      const isActive = intervalWalkSec === preset.value;
                      return (
                        <TouchableOpacity
                          key={preset.value}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          onPress={() => setIntervalWalkSec(preset.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.pgWheelRow}>
                    <WheelPicker
                      values={MINUTES_RANGE}
                      selected={Math.floor(intervalWalkSec / 60)}
                      onSelect={(m) => setIntervalWalkSec(m * 60 + (intervalWalkSec % 60))}
                      label="분"
                      colors={colors}
                    />
                    <Text style={styles.pgWheelSep}>:</Text>
                    <WheelPicker
                      values={SECONDS_RANGE}
                      selected={intervalWalkSec % 60}
                      onSelect={(s) => setIntervalWalkSec(Math.floor(intervalWalkSec / 60) * 60 + s)}
                      label="초"
                      colors={colors}
                    />
                  </View>
                </View>

                {/* ③ Number of sets */}
                <View style={styles.pgSection}>
                  <View style={styles.pgHeader}>
                    <View style={styles.pgBadge}><Text style={styles.pgBadgeText}>3</Text></View>
                    <Ionicons name="repeat-outline" size={16} color={colors.primary} />
                    <Text style={styles.pgHeaderText}>세트 수</Text>
                  </View>
                  <View style={styles.pgChipRow}>
                    {INTERVAL_SET_PRESETS.map((n) => {
                      const isActive = intervalSets === n && !intervalCustomSets;
                      return (
                        <TouchableOpacity
                          key={n}
                          style={[styles.pgChip, isActive && styles.pgChipActive]}
                          onPress={() => { setIntervalSets(n); setIntervalCustomSets(''); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.pgChipText, isActive && styles.pgChipTextActive]}>
                            {n}세트
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.pgCustomRow}>
                    <View style={styles.pgCustomInputWrap}>
                      <TextInput
                        style={styles.pgCustomInput}
                        keyboardType="number-pad"
                        value={intervalCustomSets}
                        onChangeText={(v) => {
                          const cleaned = v.replace(/[^0-9]/g, '');
                          setIntervalCustomSets(cleaned);
                          const num = parseInt(cleaned, 10);
                          if (!isNaN(num) && num > 0 && num <= 99) {
                            setIntervalSets(num);
                          }
                        }}
                        placeholder="직접 입력"
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.pgCustomUnit}>세트</Text>
                    </View>
                  </View>
                </View>

                {/* Summary banner */}
                {intervalRunSec > 0 && intervalWalkSec > 0 && intervalSets > 0 && (
                  <View style={styles.pgSummary}>
                    <Text style={styles.pgSummaryText}>
                      {formatTimeInput(intervalRunSec)} 달리기 / {formatTimeInput(intervalWalkSec)} 걷기 × {intervalSets}세트
                    </Text>
                    <Text style={[styles.pgSummaryText, { marginTop: 2, opacity: 0.8 }]}>
                      총 {formatTimeInput((intervalRunSec + intervalWalkSec) * intervalSets)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Bottom buttons */}
          <View style={styles.bottomRow}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleReset}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.resetText}>초기화</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>설정 완료</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
      gap: SPACING.sm,
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
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
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
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    pgChip: {
      paddingHorizontal: SPACING.lg,
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
