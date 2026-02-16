import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import type { AuthStackParamList } from '../../types/navigation';
import type { AuthProvider } from '../../types/api';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type LoginNav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginNav>();
  const { login, isLoading, error, isNewUser } = useAuthStore();
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(
    null,
  );

  const handleSocialLogin = async (provider: AuthProvider) => {
    setActiveProvider(provider);
    try {
      // In a real implementation, this would first invoke the social SDK
      // (Kakao SDK / Apple Sign In) to get a social token, then pass it
      // to our backend. For now we simulate with a placeholder token.
      const mockToken = `mock_${provider}_token_${Date.now()}`;
      await login(provider, mockToken);

      // After login, authStore checks isNewUser.
      // If isNewUser is true, RootNavigator stays on Auth stack,
      // and we navigate to Onboarding.
      if (useAuthStore.getState().isNewUser) {
        navigation.navigate('Onboarding');
      }
      // If not a new user, RootNavigator automatically switches to Main.
    } catch {
      Alert.alert(
        '로그인 실패',
        error ?? '다시 시도해 주세요.',
        [{ text: '확인' }],
      );
    } finally {
      setActiveProvider(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.appName}>RunCrew</Text>
          <Text style={styles.tagline}>함께 달리는 즐거움</Text>
          <Text style={styles.subtitle}>
            나만의 코스를 등록하고{'\n'}다른 러너들과 경쟁해 보세요
          </Text>
        </View>

        {/* Login Buttons */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={styles.kakaoButton}
            onPress={() => handleSocialLogin('kakao')}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.kakaoIcon}>💬</Text>
            <Text style={styles.kakaoText}>
              {activeProvider === 'kakao' ? '로그인 중...' : '카카오로 시작하기'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.appleButton}
            onPress={() => handleSocialLogin('apple')}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.appleIcon}></Text>
            <Text style={styles.appleText}>
              {activeProvider === 'apple' ? '로그인 중...' : 'Apple로 시작하기'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            계속 진행하면 서비스 이용약관 및{'\n'}개인정보 처리방침에 동의하게 됩니다.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: SPACING.sm,
  },
  buttonSection: {
    gap: SPACING.md,
    alignItems: 'center',
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.kakaoYellow,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    width: '100%',
    gap: SPACING.sm,
  },
  kakaoIcon: {
    fontSize: 20,
  },
  kakaoText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.kakaoBlack,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.appleWhite,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    width: '100%',
    gap: SPACING.sm,
  },
  appleIcon: {
    fontSize: 20,
    color: COLORS.black,
  },
  appleText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.black,
  },
  terms: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: SPACING.sm,
  },
});
