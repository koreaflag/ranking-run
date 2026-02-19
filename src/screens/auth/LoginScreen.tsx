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
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

// Configure Google Sign In — replace with your iOS client ID
GoogleSignin.configure({
  iosClientId: 'YOUR_GOOGLE_IOS_CLIENT_ID',
});

export default function LoginScreen() {
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

      await login('apple', credential.identityToken, rawNonce);
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return; // user cancelled
      Alert.alert('앗...!', 'Apple 로그인에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── Google Sign In ─────────────────────────────────────────
  const handleGoogleLogin = async () => {
    try {
      setLoadingProvider('google');

      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();

      const idToken = userInfo.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token from Google');
      }

      await login('google', idToken);
    } catch (e: any) {
      // statusCodes.SIGN_IN_CANCELLED = '12501'
      if (e.code === '12501' || e.code === 'SIGN_IN_CANCELLED') return;
      Alert.alert('앗...!', 'Google 로그인에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── Dev Login ──────────────────────────────────────────────
  const handleDevLogin = async () => {
    try {
      setLoadingProvider('dev');
      await devLogin('dev_runner', 'dev@runcrew.test');
    } catch {
      Alert.alert('앗...!', error ?? '다시 시도해 주세요.');
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
              <Text style={styles.logoText}>Run</Text>
              <Text style={styles.logoText}>Crew</Text>
            </View>

            <Text style={styles.tagline}>
              나만의 코스를 달리고{'\n'}전국의 러너들과 겨뤄보세요
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
                      Apple로 시작하기
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
                    Google로 시작하기
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
                  {loadingProvider === 'dev' ? '접속 중...' : 'DEV LOGIN'}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.footerNote}>
              로그인 시 이용약관 및 개인정보 처리방침에 동의합니다
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
