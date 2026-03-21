import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Image,
  Animated,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../../lib/icons';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';

const COUNTRIES = [
  { code: 'KR', flag: '🇰🇷', name: '대한민국' },
  { code: 'JP', flag: '🇯🇵', name: '日本' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'CN', flag: '🇨🇳', name: '中国' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'DE', flag: '🇩🇪', name: 'Deutschland' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'TW', flag: '🇹🇼', name: '台灣' },
  { code: 'TH', flag: '🇹🇭', name: 'ไทย' },
  { code: 'VN', flag: '🇻🇳', name: 'Việt Nam' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'ES', flag: '🇪🇸', name: 'España' },
  { code: 'IT', flag: '🇮🇹', name: 'Italia' },
  { code: 'NL', flag: '🇳🇱', name: 'Nederland' },
  { code: 'SE', flag: '🇸🇪', name: 'Sverige' },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
];

const TOTAL_STEPS = 3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { completeOnboarding } = useAuthStore();

  const [step, setStep] = useState(0); // 0=nickname, 1=country, 2=avatar
  const [nickname, setNickname] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [nicknameFocused, setNicknameFocused] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const greetingScale = useRef(new Animated.Value(0.8)).current;
  const greetingOpacity = useRef(new Animated.Value(0)).current;

  const isValidNickname = nickname.length >= 2 && nickname.length <= 12;
  const selectedCountryObj = COUNTRIES.find((c) => c.code === selectedCountry);

  const animateTransition = useCallback((nextStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const handleNext = useCallback(() => {
    if (step === 0 && isValidNickname) {
      animateTransition(1);
    } else if (step === 1 && selectedCountry) {
      animateTransition(2);
    }
  }, [step, isValidNickname, selectedCountry, animateTransition]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      animateTransition(step - 1);
    }
  }, [step, animateTransition]);

  const handlePickAvatar = useCallback(() => {
    Alert.alert(t('auth.onboarding.profilePhoto'), t('auth.onboarding.photoSource'), [
      { text: t('common.camera'), onPress: () => pickImage('camera') },
      { text: t('common.library'), onPress: () => pickImage('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [t]);

  const pickImage = async (source: 'camera' | 'library') => {
    const permissionResult =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleComplete = useCallback(async () => {
    if (!isValidNickname || !selectedCountry) return;
    setIsSubmitting(true);

    try {
      let uploadedUrl: string | undefined;
      if (avatarUri) {
        try {
          const response = await authService.uploadAvatar(avatarUri);
          uploadedUrl = response.url;
        } catch {
          // Avatar upload failed, continue without it
        }
      }

      // Show greeting before completing
      setShowGreeting(true);
      Animated.parallel([
        Animated.spring(greetingScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
        Animated.timing(greetingOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      // Wait for greeting animation, then complete
      setTimeout(async () => {
        try {
          await completeOnboarding(nickname, uploadedUrl, selectedCountry);
        } catch {
          setShowGreeting(false);
          setIsSubmitting(false);
          Alert.alert(t('common.error'), t('common.errorRetry'));
        }
      }, 2000);
    } catch {
      setIsSubmitting(false);
      Alert.alert(t('common.error'), t('common.errorRetry'));
    }
  }, [isValidNickname, selectedCountry, avatarUri, nickname, completeOnboarding, greetingScale, greetingOpacity, t]);

  // ---- Greeting overlay ----
  if (showGreeting) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <Animated.View style={[styles.greetingContainer, { opacity: greetingOpacity, transform: [{ scale: greetingScale }] }]}>
          <Text style={styles.greetingEmoji}>🏃</Text>
          <Text style={styles.greetingTitle}>
            {t('auth.onboarding.greetingTitle', { nickname })}
          </Text>
          <Text style={styles.greetingSubtitle}>
            {t('auth.onboarding.greetingSubtitle')}
          </Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress bar */}
        <View style={styles.progressRow}>
          {step > 0 && (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.6}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.progressBar}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i <= step ? styles.progressDotActive : null,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>{step + 1}/{TOTAL_STEPS}</Text>
        </View>

        {/* Step content */}
        <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
          {step === 0 && (
            <NicknameStep
              nickname={nickname}
              setNickname={setNickname}
              isValid={isValidNickname}
              isFocused={nicknameFocused}
              setIsFocused={setNicknameFocused}
              onNext={handleNext}
              styles={styles}
              colors={colors}
              t={t}
            />
          )}
          {step === 1 && (
            <CountryStep
              selected={selectedCountry}
              onSelect={setSelectedCountry}
              styles={styles}
              colors={colors}
              t={t}
            />
          )}
          {step === 2 && (
            <AvatarStep
              avatarUri={avatarUri}
              onPick={handlePickAvatar}
              styles={styles}
              colors={colors}
              t={t}
            />
          )}
        </Animated.View>

        {/* Bottom button */}
        <View style={styles.buttonSection}>
          {step === 2 && !avatarUri && (
            <TouchableOpacity
              onPress={handleComplete}
              activeOpacity={0.7}
              style={styles.skipBtn}
              disabled={isSubmitting}
            >
              <Text style={styles.skipText}>{t('auth.onboarding.skip')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.ctaButton,
              (step === 0 && !isValidNickname) || (step === 1 && !selectedCountry) || isSubmitting
                ? styles.ctaButtonDisabled
                : null,
            ]}
            onPress={step === 2 ? handleComplete : handleNext}
            disabled={
              (step === 0 && !isValidNickname) || (step === 1 && !selectedCountry) || isSubmitting
            }
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.ctaText}>
                {step === 2 ? t('auth.onboarding.start') : t('auth.onboarding.next')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Step Components ----

function NicknameStep({
  nickname, setNickname, isValid, isFocused, setIsFocused, onNext, styles, colors, t,
}: {
  nickname: string; setNickname: (v: string) => void;
  isValid: boolean; isFocused: boolean; setIsFocused: (v: boolean) => void;
  onNext: () => void; styles: ReturnType<typeof createStyles>;
  colors: ThemeColors; t: (key: string) => string;
}) {
  return (
    <View style={styles.stepInner}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('auth.onboarding.nicknameTitle')}</Text>
        <Text style={styles.stepDesc}>{t('auth.onboarding.nicknameDesc')}</Text>
      </View>
      <View style={styles.inputSection}>
        <TextInput
          style={[
            styles.input,
            isFocused && { borderBottomColor: colors.primary },
          ]}
          value={nickname}
          onChangeText={setNickname}
          placeholder={t('auth.onboarding.nicknamePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={12}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onNext}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        <View style={styles.inputFooter}>
          {nickname.length > 0 && !isValid ? (
            <Text style={styles.errorText}>{t('auth.onboarding.nicknameError')}</Text>
          ) : (
            <View />
          )}
          <Text style={styles.charCount}>{nickname.length}/12</Text>
        </View>
      </View>
    </View>
  );
}

function CountryStep({
  selected, onSelect, styles, colors, t,
}: {
  selected: string | null; onSelect: (code: string) => void;
  styles: ReturnType<typeof createStyles>; colors: ThemeColors; t: (key: string) => string;
}) {
  const renderCountry = useCallback(({ item }: { item: typeof COUNTRIES[number] }) => (
    <TouchableOpacity
      style={[
        styles.countryItem,
        selected === item.code && styles.countryItemSelected,
      ]}
      onPress={() => onSelect(item.code)}
      activeOpacity={0.6}
    >
      <Text style={styles.countryFlag}>{item.flag}</Text>
      <Text style={[styles.countryName, selected === item.code && styles.countryNameSelected]}>
        {item.name}
      </Text>
      {selected === item.code && (
        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
      )}
    </TouchableOpacity>
  ), [selected, onSelect, styles, colors]);

  return (
    <View style={styles.stepInner}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t('auth.onboarding.countryTitle')}</Text>
        <Text style={styles.stepDesc}>{t('auth.onboarding.countryDesc')}</Text>
      </View>
      <FlatList
        data={COUNTRIES}
        renderItem={renderCountry}
        keyExtractor={(item) => item.code}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.countryList}
      />
    </View>
  );
}

function AvatarStep({
  avatarUri, onPick, styles, colors, t,
}: {
  avatarUri: string | null; onPick: () => void;
  styles: ReturnType<typeof createStyles>; colors: ThemeColors; t: (key: string) => string;
}) {
  return (
    <View style={[styles.stepInner, { alignItems: 'center' }]}>
      <View style={[styles.stepHeader, { alignItems: 'center' }]}>
        <Text style={[styles.stepTitle, { textAlign: 'center' }]}>{t('auth.onboarding.avatarTitle')}</Text>
        <Text style={[styles.stepDesc, { textAlign: 'center' }]}>{t('auth.onboarding.avatarDesc')}</Text>
      </View>
      <TouchableOpacity
        style={styles.avatarRing}
        onPress={onPick}
        activeOpacity={0.7}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={48} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.cameraBadge}>
          <Ionicons name="camera" size={14} color="#FFFFFF" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: SPACING.xxl,
    },

    // Progress
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xl,
      gap: SPACING.md,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressBar: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
    },
    progressDot: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.surface,
    },
    progressDotActive: {
      backgroundColor: c.primary,
    },
    stepLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },

    // Step content
    stepContent: {
      flex: 1,
    },
    stepInner: {
      flex: 1,
      gap: SPACING.xxl,
    },
    stepHeader: {
      gap: SPACING.sm,
    },
    stepTitle: {
      fontSize: 28,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -0.5,
    },
    stepDesc: {
      fontSize: FONT_SIZES.md,
      fontWeight: '400',
      color: c.textSecondary,
      lineHeight: 22,
    },

    // Nickname input
    inputSection: {
      gap: SPACING.xs,
    },
    input: {
      paddingVertical: SPACING.lg,
      fontSize: FONT_SIZES.xxl,
      fontWeight: '600',
      color: c.text,
      borderBottomWidth: 2,
      borderBottomColor: c.border,
    },
    inputFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.xs,
    },
    charCount: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    errorText: {
      fontSize: FONT_SIZES.sm,
      color: c.error,
    },

    // Country list
    countryList: {
      paddingBottom: SPACING.xl,
    },
    countryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      gap: SPACING.md,
    },
    countryItemSelected: {
      backgroundColor: c.primary + '12',
    },
    countryFlag: {
      fontSize: 28,
    },
    countryName: {
      flex: 1,
      fontSize: FONT_SIZES.lg,
      fontWeight: '500',
      color: c.text,
    },
    countryNameSelected: {
      fontWeight: '700',
      color: c.primary,
    },

    // Avatar
    avatarRing: {
      width: 140,
      height: 140,
      borderRadius: 70,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: c.primary,
      backgroundColor: c.background,
      marginTop: SPACING.xxl,
    },
    avatarCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarImage: {
      width: 120,
      height: 120,
      borderRadius: 60,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: c.background,
    },

    // Button
    buttonSection: {
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },
    skipBtn: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
    },
    skipText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textTertiary,
    },
    ctaButton: {
      width: '100%',
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.lg + 2,
      backgroundColor: c.primary,
      ...SHADOWS.md,
    },
    ctaButtonDisabled: {
      opacity: 0.35,
    },
    ctaText: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },

    // Greeting
    greetingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.lg,
      backgroundColor: c.background,
    },
    greetingEmoji: {
      fontSize: 64,
    },
    greetingTitle: {
      fontSize: 28,
      fontWeight: '900',
      color: c.text,
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    greetingSubtitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '400',
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
  });
