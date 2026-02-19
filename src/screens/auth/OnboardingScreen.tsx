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
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/authService';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

export default function OnboardingScreen() {
  const colors = useTheme();
  const { completeOnboarding, isLoading } = useAuthStore();
  const [nickname, setNickname] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isValidNickname = nickname.length >= 2 && nickname.length <= 12;
  const isBusy = isLoading || isUploading;

  const handlePickAvatar = () => {
    Alert.alert('프로필 사진', '사진을 어디서 가져올까요?', [
      {
        text: '카메라',
        onPress: () => pickImage('camera'),
      },
      {
        text: '앨범에서 선택',
        onPress: () => pickImage('library'),
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const permissionResult =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('권한 필요', '사진에 접근하려면 권한을 허용해 주세요.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleComplete = async () => {
    if (!isValidNickname) {
      Alert.alert('닉네임 확인', '닉네임은 2~12자로 입력해 주세요.');
      return;
    }

    try {
      let uploadedUrl: string | undefined;

      if (avatarUri) {
        setIsUploading(true);
        try {
          const response = await authService.uploadAvatar(avatarUri);
          uploadedUrl = response.url;
        } catch {
          Alert.alert('앗...!', '프로필 사진 없이 계속할까요?', [
            { text: '취소', style: 'cancel' },
            {
              text: '계속',
              onPress: async () => {
                setIsUploading(false);
                await completeOnboarding(nickname);
              },
            },
          ]);
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      await completeOnboarding(nickname, uploadedUrl);
    } catch {
      Alert.alert('앗...!', '다시 시도해 주세요.', [{ text: '확인' }]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>프로필 설정</Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            RUNVS에서 사용할 프로필을 만들어 주세요
          </Text>
        </View>

        {/* Avatar Selection */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={[styles.avatarRing, { backgroundColor: colors.background, borderColor: colors.primary }]}
            onPress={handlePickAvatar}
            activeOpacity={0.7}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarCircle, { backgroundColor: colors.surface }]}>
                <Ionicons name="person" size={48} color={colors.textTertiary} />
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.textTertiary }]}>
            탭하여 프로필 사진 설정
          </Text>
        </View>

        {/* Nickname Input */}
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>닉네임</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderBottomColor: colors.border },
              isFocused && { borderBottomColor: colors.primary },
            ]}
            value={nickname}
            onChangeText={setNickname}
            placeholder="2~12자로 입력해 주세요"
            placeholderTextColor={colors.textTertiary}
            maxLength={12}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleComplete}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
          <View style={styles.inputFooter}>
            {nickname.length > 0 && !isValidNickname ? (
              <Text style={[styles.errorText, { color: colors.error }]}>
                닉네임은 2자 이상 입력해 주세요
              </Text>
            ) : (
              <View />
            )}
            <Text style={[styles.charCount, { color: colors.textTertiary }]}>
              {nickname.length}/12
            </Text>
          </View>
        </View>

        {/* Submit */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.ctaButton,
              { backgroundColor: colors.primary },
              (!isValidNickname || isBusy) && styles.ctaButtonDisabled,
            ]}
            onPress={handleComplete}
            disabled={!isValidNickname || isBusy}
            activeOpacity={0.8}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>시작하기</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
    justifyContent: 'space-between',
  },

  // -- Header ------------------------------------------------
  header: {
    paddingTop: SPACING.xxxl + SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
    lineHeight: 24,
  },

  // -- Avatar ------------------------------------------------
  avatarSection: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarHint: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
  },

  // -- Input -------------------------------------------------
  inputSection: {
    gap: SPACING.xs,
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    borderBottomWidth: 2,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  charCount: {
    fontSize: FONT_SIZES.sm,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
  },

  // -- CTA ---------------------------------------------------
  buttonSection: {
    paddingBottom: SPACING.xxxl,
  },
  ctaButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg + 2,
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
});
