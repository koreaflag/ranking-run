import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WorldStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { Ionicons } from '../../lib/icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, type ThemeColors } from '../../utils/constants';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'HeartRateSettings'>;

interface GuideStep {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bgColor: string;
  label: string;
}

const IOS_GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'watch-outline',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    label: 'Apple Watch를 착용하세요.',
  },
  {
    icon: 'settings-outline',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    label: 'iPhone 설정으로 이동합니다.',
  },
  {
    icon: 'bluetooth',
    iconColor: '#FFFFFF',
    bgColor: '#007AFF',
    label: 'Bluetooth를 탭하여 장치에 연결합니다.',
  },
  {
    icon: 'heart',
    iconColor: '#FFFFFF',
    bgColor: '#FF2D55',
    label: '건강 앱으로 이동합니다.',
  },
  {
    icon: 'download-outline',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    label: '소스로 들어가 RUNVS를 선택하세요.',
  },
  {
    icon: 'pulse',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    label: '심박수를 켜세요.',
  },
  {
    icon: 'walk',
    iconColor: '#FFFFFF',
    bgColor: COLORS.primary,
    label: "위의 '심박수 표시'를 켜짐으로 전환합니다.",
  },
];

const ANDROID_GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'watch-outline',
    iconColor: '#FFFFFF',
    bgColor: '#1428A0',
    label: '갤럭시 워치를 착용하세요.',
  },
  {
    icon: 'phone-portrait-outline',
    iconColor: '#FFFFFF',
    bgColor: '#1428A0',
    label: 'Galaxy Wearable 앱을 실행합니다.',
  },
  {
    icon: 'bluetooth',
    iconColor: '#FFFFFF',
    bgColor: '#4285F4',
    label: 'Bluetooth로 워치가 연결되어 있는지 확인합니다.',
  },
  {
    icon: 'heart',
    iconColor: '#FFFFFF',
    bgColor: '#E64A19',
    label: 'Samsung Health 앱에서 심박수 측정을 활성화합니다.',
  },
  {
    icon: 'pulse',
    iconColor: '#FFFFFF',
    bgColor: '#1428A0',
    label: '워치 설정 > 심박수에서 자동 측정을 켜세요.',
  },
  {
    icon: 'walk',
    iconColor: '#FFFFFF',
    bgColor: COLORS.primary,
    label: "위의 '심박수 표시'를 켜짐으로 전환합니다.",
  },
];

const GUIDE_STEPS = Platform.OS === 'ios' ? IOS_GUIDE_STEPS : ANDROID_GUIDE_STEPS;

export default function HeartRateSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const showHeartRate = useSettingsStore((s) => s.showHeartRate);
  const setShowHeartRate = useSettingsStore((s) => s.setShowHeartRate);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Staggered entrance animations
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const sectionAnim = useRef(new Animated.Value(0)).current;
  const rowAnims = useRef(GUIDE_STEPS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = [
      Animated.timing(toggleAnim, {
        toValue: 1,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(sectionAnim, {
        toValue: 1,
        duration: 350,
        delay: 200,
        useNativeDriver: true,
      }),
      ...rowAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          delay: 300 + i * 100,
          useNativeDriver: true,
        }),
      ),
    ];
    Animated.parallel(animations).start();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>심박수</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Toggle Row */}
        <Animated.View
          style={[
            styles.toggleRow,
            {
              opacity: toggleAnim,
              transform: [{
                translateY: toggleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              }],
            },
          ]}
        >
          <Text style={styles.toggleLabel}>심박수 표시</Text>
          <Switch
            value={showHeartRate}
            onValueChange={setShowHeartRate}
            trackColor={{ false: colors.surfaceLight, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </Animated.View>

        {/* Section Header */}
        <Animated.View
          style={[
            styles.sectionHeader,
            {
              opacity: sectionAnim,
              transform: [{
                translateY: sectionAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              }],
            },
          ]}
        >
          <Text style={styles.sectionHeaderText}>장치 연결하기</Text>
        </Animated.View>

        {/* Guide Steps */}
        <View style={styles.guideContainer}>
          {GUIDE_STEPS.map((step, index) => (
            <Animated.View
              key={index}
              style={{
                opacity: rowAnims[index],
                transform: [{
                  translateY: rowAnims[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                }],
              }}
            >
              <View style={styles.guideRow}>
                <View style={[styles.iconCircle, { backgroundColor: step.bgColor }]}>
                  <Ionicons name={step.icon} size={20} color={step.iconColor} />
                </View>
                <Text style={styles.guideText}>{step.label}</Text>
              </View>
              {index < GUIDE_STEPS.length - 1 && <View style={styles.divider} />}
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 52,
      paddingHorizontal: SPACING.lg,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    headerSpacer: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.xl,
      backgroundColor: colors.card,
      marginTop: SPACING.xl,
      marginHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
    },
    toggleLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: colors.text,
    },
    sectionHeader: {
      paddingHorizontal: SPACING.xl,
      paddingTop: 36,
      paddingBottom: SPACING.md,
    },
    sectionHeaderText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    guideContainer: {
      backgroundColor: colors.card,
      marginHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.sm,
    },
    guideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: 16,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    guideText: {
      fontSize: FONT_SIZES.md,
      color: colors.textSecondary,
      marginLeft: SPACING.lg,
      flex: 1,
      lineHeight: 20,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginLeft: SPACING.xl + 40 + SPACING.lg,
    },
  });
}
