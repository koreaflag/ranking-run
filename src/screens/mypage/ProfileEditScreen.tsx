import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Image,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { authService } from '../../services/authService';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuthStore();
  const darkMode = useSettingsStore((s) => s.darkMode);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<Date | null>(
    user?.birthday ? new Date(user.birthday) : null,
  );
  const [heightCm, setHeightCm] = useState(
    user?.height_cm != null ? String(user.height_cm) : '',
  );
  const [weightKg, setWeightKg] = useState(
    user?.weight_kg != null ? String(user.weight_kg) : '',
  );
  const [bio, setBio] = useState(user?.bio ?? '');
  const [instagram, setInstagram] = useState(user?.instagram_username ?? '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const birthdayYPosition = useRef(0);

  const handleOpenDatePicker = useCallback(() => {
    Keyboard.dismiss();
    setShowDatePicker(true);
    // Scroll to birthday field after picker renders
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: birthdayYPosition.current - 80, animated: true });
    }, 100);
  }, []);

  const isValidNickname = nickname.length >= 2 && nickname.length <= 12;

  const handlePickAvatar = () => {
    Alert.alert('프로필 사진', '사진을 어디서 가져올까요?', [
      { text: '카메라', onPress: () => pickImage('camera') },
      { text: '앨범에서 선택', onPress: () => pickImage('library') },
      ...(user?.avatar_url || avatarUri
        ? [{ text: '기본 이미지로 변경', onPress: () => setAvatarUri('__remove__') }]
        : []),
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
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

  const handleSave = async () => {
    if (!isValidNickname) {
      Alert.alert('닉네임 확인', '닉네임은 2~12자로 입력해 주세요.');
      return;
    }

    const parsedHeight = heightCm ? parseFloat(heightCm) : null;
    const parsedWeight = weightKg ? parseFloat(weightKg) : null;

    if (parsedHeight != null && (parsedHeight < 50 || parsedHeight > 300)) {
      Alert.alert('입력 확인', '키는 50~300cm 사이로 입력해 주세요.');
      return;
    }
    if (parsedWeight != null && (parsedWeight < 20 || parsedWeight > 500)) {
      Alert.alert('입력 확인', '몸무게는 20~500kg 사이로 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    try {
      let uploadedAvatarUrl: string | null | undefined;

      if (avatarUri === '__remove__') {
        uploadedAvatarUrl = null;
      } else if (avatarUri) {
        const uploadResponse = await authService.uploadAvatar(avatarUri);
        uploadedAvatarUrl = uploadResponse.url;
      }

      const updated = await authService.updateProfile({
        nickname,
        ...(uploadedAvatarUrl !== undefined && { avatar_url: uploadedAvatarUrl }),
        birthday: birthday ? birthday.toISOString().split('T')[0] : null,
        height_cm: parsedHeight,
        weight_kg: parsedWeight,
        bio: bio.trim() || null,
        instagram_username: instagram.trim() || null,
      });

      setUser({
        ...user!,
        nickname: updated.nickname,
        avatar_url: updated.avatar_url,
        birthday: updated.birthday,
        height_cm: updated.height_cm,
        weight_kg: updated.weight_kg,
        bio: updated.bio,
        instagram_username: updated.instagram_username,
      });

      navigation.goBack();
    } catch {
      Alert.alert('앗...!', '프로필 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayAvatarUri =
    avatarUri === '__remove__' ? null : avatarUri ?? user?.avatar_url ?? null;

  const formatBirthday = (d: Date) =>
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>프로필 수정</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving || !isValidNickname}
            activeOpacity={0.7}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.saveButton,
                  (!isValidNickname || isSaving) && styles.saveButtonDisabled,
                ]}
              >
                저장
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handlePickAvatar}
              activeOpacity={0.7}
            >
              {displayAvatarUri ? (
                <Image source={{ uri: displayAvatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={40} color={colors.textTertiary} />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Nickname */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>닉네임</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder="2~12자"
                placeholderTextColor={colors.textTertiary}
                maxLength={12}
                returnKeyType="done"
              />
              <Text style={styles.charCount}>{nickname.length}/12</Text>
            </View>
            {nickname.length > 0 && !isValidNickname && (
              <Text style={styles.errorText}>닉네임은 2자 이상 입력해 주세요</Text>
            )}
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>자기소개</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.bioInput}
                value={bio}
                onChangeText={setBio}
                placeholder="한 줄로 나를 소개해 주세요"
                placeholderTextColor={colors.textTertiary}
                maxLength={100}
                multiline
                returnKeyType="default"
              />
              <Text style={styles.charCount}>{bio.length}/100</Text>
            </View>
          </View>

          {/* Instagram */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>인스타그램</Text>
            <View style={styles.unitInputRow}>
              <Text style={styles.unitLabel}>@</Text>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder="인스타그램 아이디"
                placeholderTextColor={colors.textTertiary}
                maxLength={30}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Birthday */}
          <View
            style={styles.fieldGroup}
            onLayout={(e) => { birthdayYPosition.current = e.nativeEvent.layout.y; }}
          >
            <Text style={styles.fieldLabel}>생년월일</Text>
            <TouchableOpacity
              style={styles.selectInput}
              onPress={handleOpenDatePicker}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.selectInputText,
                  !birthday && { color: colors.textTertiary },
                ]}
              >
                {birthday ? formatBirthday(birthday) : '생년월일을 선택해 주세요'}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <View>
              <DateTimePicker
                value={birthday ?? new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={darkMode ? 'dark' : 'light'}
                maximumDate={new Date()}
                minimumDate={new Date(1920, 0, 1)}
                onChange={(_, selectedDate) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (selectedDate) setBirthday(selectedDate);
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.dateConfirmButton}
                  onPress={() => setShowDatePicker(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateConfirmText}>확인</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Height & Weight */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>키</Text>
              <View style={styles.unitInputRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={heightCm}
                  onChangeText={setHeightCm}
                  placeholder="170"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  returnKeyType="done"
                />
                <Text style={styles.unitLabel}>cm</Text>
              </View>
            </View>

            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>몸무게</Text>
              <View style={styles.unitInputRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={weightKg}
                  onChangeText={setWeightKg}
                  placeholder="65"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  returnKeyType="done"
                />
                <Text style={styles.unitLabel}>kg</Text>
              </View>
            </View>
          </View>

          {/* Info note */}
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.infoText}>
              개인 정보는 칼로리 계산 등 러닝 통계에만 활용되며, 다른 사용자에게 공개되지 않습니다.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    saveButton: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.primary,
    },
    saveButtonDisabled: {
      opacity: 0.35,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: SPACING.xxl,
      gap: SPACING.xl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },

    // Avatar
    avatarSection: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    avatarWrapper: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    avatarImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderColor: c.border,
    },
    avatarPlaceholder: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: c.surfaceLight,
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },

    // Fields
    fieldGroup: {
      gap: SPACING.sm,
    },
    fieldLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    textInput: {
      flex: 1,
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.text,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1.5,
      borderBottomColor: c.border,
    },
    bioInput: {
      flex: 1,
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.text,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1.5,
      borderBottomColor: c.border,
      minHeight: 60,
      textAlignVertical: 'top',
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
    selectInput: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1.5,
      borderBottomColor: c.border,
    },
    selectInputText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.text,
    },
    rowFields: {
      flexDirection: 'row',
      gap: SPACING.xl,
    },
    unitInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    unitLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textTertiary,
      paddingBottom: SPACING.md,
    },

    // Date picker confirm
    dateConfirmButton: {
      alignSelf: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xxxl,
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.full,
      marginTop: SPACING.sm,
    },
    dateConfirmText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Info box
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoText: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      lineHeight: 20,
    },
  });
