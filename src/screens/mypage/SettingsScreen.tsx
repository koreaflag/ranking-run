import React, { useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
  Dimensions,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import type { MyPageStackParamList } from '../../types/navigation';
import { useSettingsStore } from '../../stores/settingsStore';
import type { AppLanguage } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import i18n from '../../i18n';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MyPageStackParamList>>();
  const colors = useTheme();
  const { t } = useTranslation();
  const { logout } = useAuthStore();
  const {
    language,
    setLanguage,
    darkMode,
    setDarkMode,
    voiceGuidance,
    setVoiceGuidance,
    autoPause,
    setAutoPause,
    map3DStyle,
    setMap3DStyle,
  } = useSettingsStore();

  const LANGUAGES: { key: AppLanguage; label: string }[] = [
    { key: 'ko', label: '한국어' },
    { key: 'en', label: 'English' },
    { key: 'ja', label: '日本語' },
  ];

  const handleLanguageChange = (lang: AppLanguage) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = () => {
    Alert.alert(t('settings.logout'), t('settings.logoutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.withdraw'),
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
          title={t('settings.title')}
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Running Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.running')}</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="pause-circle-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>{t('settings.autoPause')}</Text>
                    <Text style={styles.toggleDescription}>
                      {autoPause ? t('settings.autoPauseOnDesc') : t('settings.autoPauseOffDesc')}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={autoPause}
                  onValueChange={setAutoPause}
                  trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </View>

          {/* Language Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
            <View style={styles.card}>
              {LANGUAGES.map((lang, idx) => (
                <React.Fragment key={lang.key}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.langOptionRow}
                    onPress={() => handleLanguageChange(lang.key)}
                    activeOpacity={0.6}
                  >
                    <Text style={[
                      styles.langOptionLabel,
                      language === lang.key && { color: colors.primary, fontWeight: '700' as const },
                    ]}>
                      {lang.label}
                    </Text>
                    {language === lang.key && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* Appearance Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.appSettings')}</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="moon-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>{t('settings.darkMode')}</Text>
                    <Text style={styles.toggleDescription}>
                      {darkMode ? t('settings.darkModeOnDesc') : t('settings.darkModeOffDesc')}
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
                    <Text style={styles.toggleLabel}>{t('settings.voiceGuidance')}</Text>
                    <Text style={styles.toggleDescription}>
                      {voiceGuidance ? t('settings.voiceOnDesc') : t('settings.voiceOffDesc')}
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
                    <Text style={styles.toggleLabel}>{t('settings.map3d')}</Text>
                    <Text style={styles.toggleDescription}>
                      {map3DStyle ? t('settings.map3dOnDesc') : t('settings.map3dOffDesc')}
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

          {/* Integration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.integration')}</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('ImportActivity')}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionLabel}>{t('mypage.menuImport')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('StravaConnect')}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: '#FC4C0220' }]}>
                    <Text style={{ color: '#FC4C02', fontWeight: '900', fontSize: 10 }}>STR</Text>
                  </View>
                  <Text style={styles.actionLabel}>{t('mypage.menuStrava')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Legal Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.legal')}</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('TermsOfService')}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionLabel}>{t('settings.termsOfService')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('PrivacyPolicy')}
                activeOpacity={0.7}
              >
                <View style={styles.toggleLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionLabel}>{t('settings.privacyPolicy')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
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
                  <Text style={styles.actionLabel}>{t('settings.logout')}</Text>
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
                  <Text style={styles.dangerLabel}>{t('settings.deleteAccount')}</Text>
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

    // Language
    langOptionRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.xl,
      gap: SPACING.md,
    },
    langOptionLabel: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '500' as const,
      color: c.text,
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
