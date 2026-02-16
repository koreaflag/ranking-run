import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/common/Button';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

export default function OnboardingScreen() {
  const { completeOnboarding, isLoading } = useAuthStore();
  const [nickname, setNickname] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🏃');

  const isValidNickname = nickname.length >= 2 && nickname.length <= 12;

  const emojiOptions = ['🏃', '🏃‍♀️', '🏃‍♂️', '🐎', '⚡', '🔥', '🌟', '🎯'];

  const handleComplete = async () => {
    if (!isValidNickname) {
      Alert.alert('닉네임 확인', '닉네임은 2~12자로 입력해 주세요.');
      return;
    }

    try {
      await completeOnboarding(nickname);
      // On success, authStore sets isAuthenticated=true and isNewUser=false,
      // which causes RootNavigator to switch to the Main stack.
    } catch {
      Alert.alert('프로필 설정 실패', '다시 시도해 주세요.', [{ text: '확인' }]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>프로필 설정</Text>
          <Text style={styles.subtitle}>
            RunCrew에서 사용할 프로필을 설정해 주세요
          </Text>
        </View>

        {/* Avatar Selection */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{avatarEmoji}</Text>
          </View>
          <View style={styles.emojiGrid}>
            {emojiOptions.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.emojiOption,
                  avatarEmoji === emoji && styles.emojiOptionSelected,
                ]}
                onPress={() => setAvatarEmoji(emoji)}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.photoButton}>
            <Text style={styles.photoButtonText}>사진에서 선택</Text>
          </TouchableOpacity>
        </View>

        {/* Nickname Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>닉네임</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="2~12자로 입력해 주세요"
            placeholderTextColor={COLORS.textTertiary}
            maxLength={12}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleComplete}
          />
          <Text style={styles.charCount}>
            {nickname.length}/12
          </Text>
          {nickname.length > 0 && !isValidNickname && (
            <Text style={styles.errorText}>
              닉네임은 2자 이상 입력해 주세요
            </Text>
          )}
        </View>

        {/* Submit */}
        <View style={styles.buttonSection}>
          <Button
            title="시작하기"
            onPress={handleComplete}
            disabled={!isValidNickname}
            loading={isLoading}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: SPACING.xxl,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: SPACING.xxxl,
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  avatarSection: {
    alignItems: 'center',
    gap: SPACING.lg,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarText: {
    fontSize: 48,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.transparent,
  },
  emojiOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceLight,
  },
  emojiText: {
    fontSize: 22,
  },
  photoButton: {
    paddingVertical: SPACING.sm,
  },
  photoButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputSection: {
    gap: SPACING.sm,
  },
  inputLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  charCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    textAlign: 'right',
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
  buttonSection: {
    paddingBottom: SPACING.xxxl,
  },
});
