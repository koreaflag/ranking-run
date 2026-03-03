import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

// ---- Types ----

export interface RunGoal {
  type: 'distance' | 'time' | 'pace' | null;
  value: number | null; // meters for distance, seconds for time, seconds/km for pace
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

type GoalType = 'distance' | 'time' | 'pace';

const GOAL_TYPES: Array<{ type: GoalType; label: string; icon: string }> = [
  { type: 'distance', label: '거리', icon: 'flag-outline' },
  { type: 'time', label: '시간', icon: 'timer-outline' },
  { type: 'pace', label: '페이스', icon: 'speedometer-outline' },
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  // Local state for editing before confirming
  const [selectedType, setSelectedType] = useState<GoalType | null>(goal.type);
  const [selectedValue, setSelectedValue] = useState<number | null>(goal.value);
  const [customInput, setCustomInput] = useState('');

  // Sync local state when goal prop changes
  useEffect(() => {
    setSelectedType(goal.type);
    setSelectedValue(goal.value);
    setCustomInput('');
  }, [goal.type, goal.value]);

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
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, overlayOpacity]);

  const handleTypeSelect = (type: GoalType) => {
    if (selectedType === type) {
      // Deselect
      setSelectedType(null);
      setSelectedValue(null);
    } else {
      setSelectedType(type);
      setSelectedValue(null);
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
        // User inputs km, we store meters
        value = num * 1000;
        break;
      case 'time':
        // User inputs minutes, we store seconds
        value = num * 60;
        break;
      case 'pace':
        // User inputs minutes (e.g. 5.5 for 5'30"), we store seconds/km
        value = num * 60;
        break;
      default:
        return;
    }
    setSelectedValue(value);
  };

  const handleReset = () => {
    setSelectedType(null);
    setSelectedValue(null);
    setCustomInput('');
    onGoalChange({ type: null, value: null });
  };

  const handleConfirm = () => {
    onGoalChange({ type: selectedType, value: selectedValue });
    onClose();
  };

  const getCustomPlaceholder = (): string => {
    switch (selectedType) {
      case 'distance': return 'km 입력 (예: 7.5)';
      case 'time': return '분 입력 (예: 45)';
      case 'pace': return '분 입력 (예: 5.5)';
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
            onPress={onClose}
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
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
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
                    size={24}
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

          {/* Value picker — shown only when a type is selected */}
          {selectedType && (
            <View style={styles.valueSection}>
              {/* Quick preset buttons */}
              <View style={styles.presetRow}>
                {getPresets().map((preset) => {
                  const isActive = selectedValue === preset.value;
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

              {/* Custom input */}
              <View style={styles.customRow}>
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
      paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xxl,
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
      gap: SPACING.md,
      marginBottom: SPACING.xxl,
    },
    typeCard: {
      flex: 1,
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.lg,
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
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    typeLabelSelected: {
      color: c.primary,
      fontWeight: '700',
    },

    // Value picker section
    valueSection: {
      gap: SPACING.lg,
      marginBottom: SPACING.xxl,
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
    customInput: {
      flex: 1,
      height: 44,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
      paddingHorizontal: SPACING.lg,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
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
