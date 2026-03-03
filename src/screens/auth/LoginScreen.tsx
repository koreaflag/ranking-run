import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Ionicons } from '@expo/vector-icons';
import type { AuthStackParamList } from '../../types/navigation';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

GoogleSignin.configure({
  iosClientId: '61103557165-n17ms089q66usovminu6atdoruj0udq6.apps.googleusercontent.com',
});

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { t } = useTranslation();
  const { login, devLogin, isLoading, error } = useAuthStore();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // ── Apple Sign In ──────────────────────────────────────────
  const handleAppleLogin = async () => {
    try {
      setLoadingProvider('apple');

      // Generate nonce
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('No identity token');
      }

      const isNew = await login('apple', credential.identityToken, rawNonce);
      if (isNew) {
        navigation.replace('Consent');
      }
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return; // user cancelled
      Alert.alert(t('common.error'), t('auth.login.appleError'));
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── Google Sign In ─────────────────────────────────────────
  const handleGoogleLogin = async () => {
    try {
      setLoadingProvider('google');

      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut().catch(() => {});
      const userInfo = await GoogleSignin.signIn();

      const idToken = userInfo.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token from Google');
      }

      const isNew = await login('google', idToken);
      if (isNew) {
        navigation.replace('Consent');
      }
    } catch (e: any) {
      // statusCodes.SIGN_IN_CANCELLED = '12501'
      if (e.code === '12501' || e.code === 'SIGN_IN_CANCELLED') return;
      Alert.alert(t('common.error'), t('auth.login.googleError'));
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── Dev Login ──────────────────────────────────────────────
  const handleDevLogin = async () => {
    try {
      setLoadingProvider('dev');
      await devLogin('dev_runner', 'dev@runcrew.test');
      // Dev login skips consent for convenience
    } catch {
      Alert.alert(t('common.error'), error ?? t('common.errorRetry'));
    } finally {
      setLoadingProvider(null);
    }
  };

  const disabled = isLoading || loadingProvider !== null;

  return (
    <BlurredBackground intensity={90}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} />

        <View style={styles.content}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>RUNVS</Text>
            </View>

            <Text style={styles.tagline}>
              {t('auth.login.tagline')}
            </Text>

            <View style={styles.accentLine} />
          </View>

          {/* Login Buttons */}
          <View style={styles.buttonSection}>
            {/* Apple Sign In */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.socialButton, styles.appleButton, disabled && styles.buttonDisabled]}
                onPress={handleAppleLogin}
                disabled={disabled}
                activeOpacity={0.8}
              >
                {loadingProvider === 'apple' ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#FFF" />
                    <Text style={[styles.socialButtonText, styles.appleText]}>
                      {t('auth.login.appleButton')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Google Sign In */}
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton, disabled && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={disabled}
              activeOpacity={0.8}
            >
              {loadingProvider === 'google' ? (
                <ActivityIndicator color="#333" size="small" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#333" />
                  <Text style={[styles.socialButtonText, styles.googleText]}>
                    {t('auth.login.googleButton')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Dev Login (only in development) */}
            {__DEV__ && (
              <TouchableOpacity
                style={[styles.devButton, disabled && styles.buttonDisabled]}
                onPress={handleDevLogin}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={styles.devButtonText}>
                  {loadingProvider === 'dev' ? t('auth.login.connecting') : 'DEV LOGIN'}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.footerNote}>
              {t('auth.login.footer')}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
  },

  // ── Hero ──────────────────────────────────────────────────
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 64,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -2,
    lineHeight: 68,
  },
  tagline: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
    color: c.textTertiary,
    textAlign: 'center',
    lineHeight: 26,
    marginTop: SPACING.sm,
  },
  accentLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.primary,
    marginTop: SPACING.xs,
  },

  // ── Buttons ────────────────────────────────────────────────
  buttonSection: {
    gap: SPACING.sm,
    alignItems: 'center',
  },
  socialButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md + 2,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  socialButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Apple
  appleButton: {
    backgroundColor: '#000',
  },
  appleText: {
    color: '#FFF',
  },

  // Google
  googleButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  googleText: {
    color: '#333',
  },

  // Dev
  devButton: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  devButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },

  footerNote: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
