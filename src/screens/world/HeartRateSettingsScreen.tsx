import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
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
import { Ionicons } from '../../lib/icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, type ThemeColors } from '../../utils/constants';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'HeartRateSettings'>;

interface GuideStep {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bgColor: string;
  title: string;
  description: string;
}

const IOS_GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'watch-outline',
    iconColor: '#FFFFFF',
    bgColor: '#007AFF',
    title: 'Apple Watch 착용',
    description: 'Apple Watch를 손목에 착용하고 iPhone과 페어링되어 있는지 확인하세요.',
  },
  {
    icon: 'phone-portrait-outline',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    title: 'iPhone 설정 열기',
    description: 'iPhone에서 설정 > 개인정보 보호 및 보안 > 건강으로 이동하세요.',
  },
  {
    icon: 'heart',
    iconColor: '#FFFFFF',
    bgColor: '#FF2D55',
    title: 'RUNVS 앱 선택',
    description: '건강 앱 목록에서 RUNVS를 찾아 탭하세요.',
  },
  {
    icon: 'pulse',
    iconColor: '#FFFFFF',
    bgColor: '#FF2D55',
    title: '심박수 권한 허용',
    description: '심박수 읽기 권한을 켜짐으로 전환하세요.',
  },
  {
    icon: 'fitness-outline',
    iconColor: '#FFFFFF',
    bgColor: '#34C759',
    title: '운동 시작',
    description: 'RUNVS에서 러닝을 시작하면 Apple Watch가 자동으로 심박수를 측정합니다.',
  },
];

const ANDROID_GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'watch-outline',
    iconColor: '#FFFFFF',
    bgColor: '#1428A0',
    title: 'Galaxy Watch 착용',
    description: 'Galaxy Watch를 손목에 착용하고 휴대폰과 연결되어 있는지 확인하세요.',
  },
  {
    icon: 'phone-portrait-outline',
    iconColor: '#FFFFFF',
    bgColor: '#1428A0',
    title: 'Galaxy Wearable 앱 열기',
    description: '휴대폰에서 Galaxy Wearable 앱을 실행하세요.',
  },
  {
    icon: 'settings-outline',
    iconColor: '#FFFFFF',
    bgColor: '#8E8E93',
    title: '워치 설정으로 이동',
    description: '워치 설정 > Samsung Health > 심박수로 이동하세요.',
  },
  {
    icon: 'pulse',
    iconColor: '#FFFFFF',
    bgColor: '#E64A19',
    title: '자동 측정 켜기',
    description: '심박수 자동 측정을 "항상 측정"으로 설정하세요.',
  },
  {
    icon: 'fitness-outline',
    iconColor: '#FFFFFF',
    bgColor: '#34C759',
    title: '운동 시작',
    description: 'RUNVS에서 러닝을 시작하면 Galaxy Watch가 자동으로 심박수를 측정합니다.',
  },
];

const GUIDE_STEPS = Platform.OS === 'ios' ? IOS_GUIDE_STEPS : ANDROID_GUIDE_STEPS;

export default function HeartRateSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Staggered entrance animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const rowAnims = useRef(GUIDE_STEPS.map(() => new Animated.Value(0))).current;
  const tipAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  // Pulse animation for step numbers
  const pulseAnims = useRef(GUIDE_STEPS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    const animations = [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
      ...rowAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 450,
          delay: 250 + i * 120,
          useNativeDriver: true,
        }),
      ),
      Animated.timing(tipAnim, {
        toValue: 1,
        duration: 400,
        delay: 250 + GUIDE_STEPS.length * 120 + 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 400,
        delay: 250 + GUIDE_STEPS.length * 120 + 250,
        useNativeDriver: true,
      }),
    ];
    Animated.parallel(animations).start();

    // Sequential pulse for each step number
    const pulseSequence = pulseAnims.map((anim, i) =>
      Animated.sequence([
        Animated.delay(600 + i * 120),
        Animated.timing(anim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(pulseSequence).start();
  }, []);

  const isIOS = Platform.OS === 'ios';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>심박수 설정</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <Animated.View
          style={[
            styles.heroSection,
            {
              opacity: headerAnim,
              transform: [{
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.heroIconWrapper}>
            <Ionicons name="heart" size={36} color="#FF2D55" />
          </View>
          <Text style={styles.heroTitle}>
            {isIOS ? 'Apple Watch' : 'Galaxy Watch'}에서{'\n'}심박수 측정하기
          </Text>
          <Text style={styles.heroDescription}>
            아래 단계를 따라 심박수 측정을 활성화하세요.{'\n'}
            러닝 중 실시간 심박수가 화면에 표시됩니다.
          </Text>
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
                {/* Step number with connector line */}
                <View style={styles.stepIndicator}>
                  <Animated.View
                    style={[
                      styles.stepNumber,
                      { transform: [{ scale: pulseAnims[index] }] },
                    ]}
                  >
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </Animated.View>
                  {index < GUIDE_STEPS.length - 1 && (
                    <View style={styles.stepLine} />
                  )}
                </View>
                {/* Icon + Text */}
                <View style={styles.stepContent}>
                  <View style={[styles.iconCircle, { backgroundColor: step.bgColor }]}>
                    <Ionicons name={step.icon} size={20} color={step.iconColor} />
                  </View>
                  <View style={styles.stepTextContainer}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Tip */}
        <Animated.View
          style={[
            styles.tipContainer,
            {
              opacity: tipAnim,
              transform: [{
                translateY: tipAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              }],
            },
          ]}
        >
          <Ionicons name="information-circle" size={18} color={colors.textTertiary} />
          <Text style={styles.tipText}>
            {isIOS
              ? '워치 앱이 설치되어 있어야 합니다. iPhone Watch 앱에서 RUNVS를 설치하세요.'
              : 'Galaxy Watch에 Samsung Health가 설치되어 있어야 합니다.'}
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Done Button */}
      <Animated.View
        style={[
          styles.buttonWrapper,
          {
            opacity: buttonAnim,
            transform: [{
              translateY: buttonAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.doneButtonText}>확인</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 52,
      paddingHorizontal: SPACING.lg,
    },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 36,
    },
    scrollView: {
      flex: 1,
    },

    // Hero
    heroSection: {
      alignItems: 'center',
      paddingTop: SPACING.xl,
      paddingBottom: 32,
      paddingHorizontal: SPACING.xl,
    },
    heroIconWrapper: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255, 45, 85, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      lineHeight: 30,
      marginBottom: SPACING.sm,
    },
    heroDescription: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Guide
    guideContainer: {
      paddingHorizontal: SPACING.lg,
    },
    guideRow: {
      flexDirection: 'row',
      minHeight: 80,
    },
    stepIndicator: {
      width: 32,
      alignItems: 'center',
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: COLORS.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    stepLine: {
      flex: 1,
      width: 2,
      backgroundColor: 'rgba(255, 122, 51, 0.2)',
      marginVertical: 4,
    },
    stepContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginLeft: SPACING.md,
      paddingBottom: SPACING.xl,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepTextContainer: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    stepTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    stepDescription: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    // Tip
    tipContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.lg,
      gap: SPACING.sm,
    },
    tipText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textTertiary,
      flex: 1,
      lineHeight: 18,
    },

    // Button
    buttonWrapper: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xl,
    },
    doneButton: {
      backgroundColor: colors.text,
      paddingVertical: 16,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
    },
    doneButtonText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.background,
    },
  });
}
