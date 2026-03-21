import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useRunningStore } from '../../stores/runningStore';
import type { WorldStackParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WatchSettings'>;

interface PermissionItem {
  key: string;
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  granted: boolean;
  canRequest: boolean;
}

export default function WatchSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationGranted] = useState(true);
  const watchConnected = useRunningStore((s) => s.watchConnected);

  // Staggered entrance animations — one per row + footer + button
  const rowAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const footerAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkPermissions();
    // Staggered fade-in + slide-up for each row
    const animations = [
      ...rowAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          delay: 150 + i * 120,
          useNativeDriver: true,
        }),
      ),
      Animated.timing(footerAnim, {
        toValue: 1,
        duration: 350,
        delay: 150 + rowAnims.length * 120 + 60,
        useNativeDriver: true,
      }),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 400,
        delay: 150 + rowAnims.length * 120 + 200,
        useNativeDriver: true,
      }),
    ];
    Animated.parallel(animations).start();
  }, []);

  const checkPermissions = async () => {
    try {
      const locStatus = await Location.getForegroundPermissionsAsync();
      setLocationGranted(locStatus.status === 'granted');
    } catch {
      setLocationGranted(false);
    }
  };

  const isIOS = Platform.OS === 'ios';

  const permissions: PermissionItem[] = isIOS ? [
    {
      key: 'location',
      title: '위치 서비스',
      description: '러닝 경로 추적에 필요합니다.',
      iconName: 'navigate',
      iconBg: '#007AFF',
      granted: locationGranted,
      canRequest: true,
    },
    {
      key: 'motion',
      title: '동작 및 피트니스',
      description: 'Apple Watch에서 페이스 및 거리를 확인하기 위해 필요합니다.',
      iconName: 'list',
      iconBg: '#FF9500',
      granted: true,
      canRequest: false,
    },
    {
      key: 'notifications',
      title: '알림',
      description: '러닝 알람을 받고 음성 응원을 듣는 데 사용합니다.',
      iconName: 'notifications',
      iconBg: '#FF3B30',
      granted: notificationGranted,
      canRequest: true,
    },
    {
      key: 'health',
      title: '건강',
      description: '심박수와 칼로리를 추적하는 데 사용합니다.',
      iconName: 'heart',
      iconBg: '#FF2D55',
      granted: true,
      canRequest: false,
    },
  ] : [
    {
      key: 'location',
      title: '위치 서비스',
      description: '러닝 경로 추적에 필요합니다.',
      iconName: 'navigate',
      iconBg: '#4285F4',
      granted: locationGranted,
      canRequest: true,
    },
    {
      key: 'activity',
      title: '활동 인식',
      description: 'Galaxy Watch에서 걸음 수와 케이던스를 측정합니다.',
      iconName: 'fitness',
      iconBg: '#1428A0',
      granted: true,
      canRequest: false,
    },
    {
      key: 'notifications',
      title: '알림',
      description: '러닝 알람을 받고 음성 응원을 듣는 데 사용합니다.',
      iconName: 'notifications',
      iconBg: '#E64A19',
      granted: notificationGranted,
      canRequest: true,
    },
    {
      key: 'health',
      title: 'Samsung Health',
      description: '심박수와 칼로리를 추적하는 데 사용합니다.',
      iconName: 'heart',
      iconBg: '#E64A19',
      granted: true,
      canRequest: false,
    },
  ];

  const handlePermissionTap = useCallback(async (item: PermissionItem) => {
    if (item.granted || !item.canRequest) return;

    if (item.key === 'location') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
      } else {
        Linking.openSettings();
      }
    } else if (item.key === 'notifications') {
      Linking.openSettings();
    }
  }, []);

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
        <Text style={styles.headerTitle}>{isIOS ? 'Apple Watch 설정' : 'Galaxy Watch 설정'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Connection Status */}
      <View style={[styles.connectionBanner, watchConnected ? styles.connectionConnected : styles.connectionDisconnected]}>
        <Ionicons
          name={watchConnected ? 'checkmark-circle' : 'close-circle'}
          size={20}
          color={watchConnected ? '#34C759' : '#FF3B30'}
        />
        <Text style={[styles.connectionText, { color: colors.text }]}>
          {isIOS ? 'Apple Watch' : 'Galaxy Watch'} — {watchConnected ? '연결됨' : '연결 안 됨'}
        </Text>
      </View>

      {/* Permission List */}
      <View style={styles.list}>
        {permissions.map((item, index) => (
          <Animated.View
            key={item.key}
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
            <TouchableOpacity
              style={styles.row}
              onPress={() => handlePermissionTap(item)}
              activeOpacity={item.granted ? 1 : 0.6}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.iconName} size={22} color="#FFFFFF" />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </View>
              <View
                style={[
                  styles.checkCircle,
                  item.granted ? styles.checkCircleGranted : styles.checkCircleDefault,
                ]}
              >
                {item.granted && (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      {/* Footer */}
      <Animated.Text
        style={[
          styles.footerText,
          {
            opacity: footerAnim,
            transform: [{
              translateY: footerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            }],
          },
        ]}
      >
        휴대폰의 [설정]에서도 변경할 수 있습니다.
      </Animated.Text>

      <View style={{ flex: 1 }} />

      {/* Done Button */}
      <Animated.View
        style={{
          opacity: buttonAnim,
          transform: [{
            translateY: buttonAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          }],
        }}
      >
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.doneButtonText}>완료</Text>
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
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.lg,
    },
    connectionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.lg,
      marginHorizontal: SPACING.xl,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    connectionConnected: {
      backgroundColor: 'rgba(52, 199, 89, 0.12)',
    },
    connectionDisconnected: {
      backgroundColor: 'rgba(255, 59, 48, 0.12)',
    },
    connectionText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
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
    },
    headerSpacer: {
      width: 36,
    },
    list: {
      paddingHorizontal: SPACING.xl,
      paddingTop: 32,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 36,
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
      marginLeft: SPACING.lg,
      marginRight: SPACING.md,
    },
    rowTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    rowDescription: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    checkCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    checkCircleGranted: {
      backgroundColor: '#34C759',
      borderColor: '#34C759',
    },
    checkCircleDefault: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
    },
    footerText: {
      fontSize: FONT_SIZES.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingHorizontal: SPACING.xxl,
      marginTop: SPACING.lg,
    },
    doneButton: {
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
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
