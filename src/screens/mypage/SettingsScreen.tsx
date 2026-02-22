import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const { logout } = useAuthStore();
  const {
    darkMode,
    setDarkMode,
    voiceGuidance,
    setVoiceGuidance,
    map3DStyle,
    setMap3DStyle,
  } = useSettingsStore();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴 시 모든 러닝 기록, 코스, 프로필 정보가\n영구적으로 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: () => {
            // TODO: 실제 회원 탈퇴 API 연동
            logout();
          },
        },
      ],
    );
  };

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title="설정"
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Appearance Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>앱 설정</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="moon-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>다크 모드</Text>
                    <Text style={styles.toggleDescription}>
                      {darkMode ? '어두운 테마 사용 중' : '밝은 테마 사용 중'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>음성 안내</Text>
                    <Text style={styles.toggleDescription}>
                      {voiceGuidance ? '코스 런닝 중 음성 안내 활성화' : '음성 안내 비활성화'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={voiceGuidance}
                  onValueChange={setVoiceGuidance}
                  trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="map-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>3D 지도</Text>
                    <Text style={styles.toggleDescription}>
                      {map3DStyle ? '월드탭 3D 지도 사용 중' : '월드탭 2D 지도 사용 중'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={map3DStyle}
                  onValueChange={setMap3DStyle}
                  trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </View>

          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.actionLabel}>로그아웃</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleDeleteAccount}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={[styles.iconCircle, styles.dangerIconCircle]}>
                    <Ionicons name="person-remove-outline" size={20} color={colors.error} />
                  </View>
                  <Text style={styles.dangerLabel}>회원 탈퇴</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* App Info */}
          <View style={styles.appInfoSection}>
            <Text style={styles.appInfoText}>RUNVS v1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xxxl + SPACING.xl,
      gap: SPACING.xl,
    },

    // Section
    section: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textTertiary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingLeft: SPACING.xs,
    },

    // Card
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },

    // Toggle Row
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xl,
    },
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      flex: 1,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    toggleInfo: {
      flex: 1,
      gap: 2,
    },
    toggleLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    toggleDescription: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
    },

    // Divider
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginLeft: SPACING.xl + 36 + SPACING.lg,
    },

    // Action Row
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xl,
    },
    actionLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },

    // Danger
    dangerIconCircle: {
      backgroundColor: `${c.error}15`,
    },
    dangerLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.error,
    },

    // App Info
    appInfoSection: {
      alignItems: 'center',
      paddingVertical: SPACING.xl,
    },
    appInfoText: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      fontWeight: '500',
    },
  });
