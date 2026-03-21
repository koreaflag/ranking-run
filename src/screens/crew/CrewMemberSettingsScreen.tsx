import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Animated,
  Pressable,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunityStackParamList } from '../../types/navigation';
import { crewService } from '../../services/crewService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { useToastStore } from '../../stores/toastStore';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CrewMemberSettings'>;
type Route = RouteProp<CommunityStackParamList, 'CrewMemberSettings'>;

const LEAVE_HOLD_DURATION = 3000;

export default function CrewMemberSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { crewId, crewName } = route.params;
  const colors = useTheme();
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.showToast);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Notification toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Leave button state
  const [isLeaving, setIsLeaving] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const startTimeRef = useRef<number>(0);

  // Load notification preference
  useEffect(() => {
    const loadPref = async () => {
      try {
        const val = await AsyncStorage.getItem(`crew_notifications_${crewId}`);
        if (val !== null) {
          setNotificationsEnabled(val === 'true');
        }
      } catch {
        // default true
      }
    };
    loadPref();
  }, [crewId]);

  const toggleNotifications = useCallback(async (value: boolean) => {
    setNotificationsEnabled(value);
    try {
      await AsyncStorage.setItem(`crew_notifications_${crewId}`, String(value));
    } catch {
      // ignore
    }
  }, [crewId]);

  const handleLeave = useCallback(async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      try {
        const Haptics = require('expo-haptics');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // haptics not available
      }
      await crewService.leaveCrew(crewId);
      showToast('success', '크루를 탈퇴했습니다');
      navigation.navigate('CommunityFeed');
    } catch {
      showToast('error', '크루 탈퇴에 실패했습니다');
      setIsLeaving(false);
    }
  }, [crewId, isLeaving, navigation, showToast]);

  const onPressIn = useCallback(() => {
    startTimeRef.current = Date.now();
    progressAnim.setValue(0);
    setHoldProgress(0);

    // Update countdown text
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, Math.ceil((LEAVE_HOLD_DURATION - elapsed) / 1000));
      setHoldProgress(remaining);
    }, 100);

    // Animate the fill
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: LEAVE_HOLD_DURATION,
      useNativeDriver: false,
    });
    animationRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) {
        if (holdTimerRef.current) {
          clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        setHoldProgress(-1); // -1 means completed
        handleLeave();
      }
    });
  }, [progressAnim, handleLeave]);

  const onPressOut = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
    progressAnim.setValue(0);
    setHoldProgress(0);
  }, [progressAnim]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      if (animationRef.current) animationRef.current.stop();
    };
  }, []);

  const fillWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const fillOpacity = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 1],
  });

  const getCountdownText = () => {
    if (holdProgress === -1) return '탈퇴!';
    if (holdProgress === 0) return '';
    return `${holdProgress}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {crewName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Settings Cards */}
      <View style={styles.content}>
        {/* Notification Section */}
        <View style={styles.sectionCard}>
          <View style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <Text style={styles.menuItemText}>크루 알림</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
          <View style={styles.menuItemHint}>
            <Text style={styles.hintText}>
              크루 게시글, 공지사항 등의 알림을 받습니다
            </Text>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.leaveSection}>
          <Text style={styles.leaveSectionTitle}>크루 탈퇴</Text>
          <Text style={styles.leaveDescription}>
            탈퇴 후에는 크루 게시판과 랭킹에서 제외됩니다.{'\n'}
            다시 가입하려면 승인이 필요할 수 있습니다.
          </Text>

          {/* Leave Button */}
          <View style={styles.leaveButtonContainer}>
            <Pressable
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={isLeaving}
              style={styles.leaveButtonOuter}
            >
              <View style={styles.leaveButton}>
                {/* Animated fill background */}
                <Animated.View
                  style={[
                    styles.leaveButtonFill,
                    {
                      width: fillWidth,
                      opacity: fillOpacity,
                    },
                  ]}
                />
                {/* Icon / countdown */}
                <View style={styles.leaveButtonContent}>
                  {holdProgress > 0 ? (
                    <Text style={styles.countdownText}>{getCountdownText()}</Text>
                  ) : holdProgress === -1 ? (
                    <Ionicons name="checkmark" size={32} color={colors.white} />
                  ) : (
                    <Ionicons name="exit-outline" size={32} color={colors.error} />
                  )}
                </View>
              </View>
            </Pressable>
            <Text style={styles.leaveHintText}>3초간 길게 눌러 탈퇴</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: SPACING.sm,
    },
    content: {
      flex: 1,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.lg,
    },

    // Settings card (iOS style)
    sectionCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      marginBottom: SPACING.xxl,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      minHeight: 52,
    },
    menuItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      flex: 1,
    },
    menuItemText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    menuItemHint: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    hintText: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      lineHeight: 18,
    },

    // Leave section
    leaveSection: {
      alignItems: 'center',
      marginTop: SPACING.huge,
    },
    leaveSectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.error,
      marginBottom: SPACING.sm,
    },
    leaveDescription: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SPACING.xxxl,
    },
    leaveButtonContainer: {
      alignItems: 'center',
    },
    leaveButtonOuter: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    leaveButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: `${c.error}18`,
      borderWidth: 2,
      borderColor: `${c.error}40`,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    leaveButtonFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: c.error,
      borderRadius: 40,
    },
    leaveButtonContent: {
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    countdownText: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '900',
      color: c.white,
    },
    leaveHintText: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      marginTop: SPACING.md,
    },
  });
}
