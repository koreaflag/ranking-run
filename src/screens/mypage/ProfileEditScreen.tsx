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
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { authService } from '../../services/authService';
import { crewService } from '../../services/crewService';
import type { CrewItem } from '../../types/api';
import { savePendingProfile, clearPendingProfile } from '../../services/pendingSyncService';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

// Country data — popular running nations + common countries
const COUNTRIES = [
  { code: 'KR', name: '대한민국' },
  { code: 'US', name: '미국' },
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'GB', name: '영국' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' },
  { code: 'CA', name: '캐나다' },
  { code: 'AU', name: '호주' },
  { code: 'NZ', name: '뉴질랜드' },
  { code: 'BR', name: '브라질' },
  { code: 'MX', name: '멕시코' },
  { code: 'AR', name: '아르헨티나' },
  { code: 'IN', name: '인도' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'PH', name: '필리핀' },
  { code: 'SG', name: '싱가포르' },
  { code: 'TW', name: '대만' },
  { code: 'HK', name: '홍콩' },
  { code: 'NL', name: '네덜란드' },
  { code: 'CH', name: '스위스' },
  { code: 'SE', name: '스웨덴' },
  { code: 'NO', name: '노르웨이' },
  { code: 'FI', name: '핀란드' },
  { code: 'DK', name: '덴마크' },
  { code: 'AT', name: '오스트리아' },
  { code: 'BE', name: '벨기에' },
  { code: 'PT', name: '포르투갈' },
  { code: 'PL', name: '폴란드' },
  { code: 'RU', name: '러시아' },
  { code: 'TR', name: '터키' },
  { code: 'AE', name: '아랍에미리트' },
  { code: 'SA', name: '사우디아라비아' },
  { code: 'IL', name: '이스라엘' },
  { code: 'ZA', name: '남아프리카공화국' },
  { code: 'KE', name: '케냐' },
  { code: 'ET', name: '에티오피아' },
  { code: 'CL', name: '칠레' },
  { code: 'CO', name: '콜롬비아' },
  { code: 'ID', name: '인도네시아' },
  { code: 'MY', name: '말레이시아' },
];

function getCountryFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function getCountryName(code: string | null): string | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
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
  const [country, setCountry] = useState<string | null>(user?.country ?? null);
  const [activityRegion, setActivityRegion] = useState(user?.activity_region ?? '');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [myCrews, setMyCrews] = useState<CrewItem[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const birthdayYPosition = useRef(0);

  // Load user's crews
  React.useEffect(() => {
    crewService.getMyCrews().then((crews) => {
      setMyCrews(crews);
      // Find currently displayed crew
      if (user?.crew_name) {
        const current = crews.find((c) => c.name === user.crew_name);
        if (current) setSelectedCrewId(current.id);
      }
    }).catch(() => {});
  }, [user?.crew_name]);

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
    Alert.alert(t('profileEdit.profilePhoto'), t('profileEdit.photoSource'), [
      { text: t('common.camera'), onPress: () => pickImage('camera') },
      { text: t('common.library'), onPress: () => pickImage('library') },
      ...(user?.avatar_url || avatarUri
        ? [{ text: t('common.defaultImage'), onPress: () => setAvatarUri('__remove__') }]
        : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
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
      Alert.alert(t('profileEdit.nicknameCheck'), t('profileEdit.nicknameCheckMsg'));
      return;
    }

    const parsedHeight = heightCm ? parseFloat(heightCm) : null;
    const parsedWeight = weightKg ? parseFloat(weightKg) : null;

    if (parsedHeight != null && (parsedHeight < 50 || parsedHeight > 300)) {
      Alert.alert(t('profileEdit.inputCheck'), t('profileEdit.heightRange'));
      return;
    }
    if (parsedWeight != null && (parsedWeight < 20 || parsedWeight > 500)) {
      Alert.alert(t('profileEdit.inputCheck'), t('profileEdit.weightRange'));
      return;
    }

    setIsSaving(true);

    // Determine new crew_name from selection
    const selectedCrew = myCrews.find((c) => c.id === selectedCrewId);
    const newCrewName = selectedCrew?.name ?? null;

    // 1) Save locally first (instant)
    const localProfile = {
      ...user!,
      nickname,
      birthday: birthday ? birthday.toISOString().split('T')[0] : null,
      height_cm: parsedHeight,
      weight_kg: parsedWeight,
      bio: bio.trim() || null,
      instagram_username: instagram.trim() || null,
      country,
      activity_region: activityRegion.trim() || undefined,
      crew_name: newCrewName,
    };

    if (avatarUri === '__remove__') {
      localProfile.avatar_url = null;
    } else if (avatarUri) {
      localProfile.avatar_url = avatarUri;
    }

    setUser(localProfile);

    const profilePayload = {
      nickname,
      birthday: birthday ? birthday.toISOString().split('T')[0] : null,
      height_cm: parsedHeight,
      weight_kg: parsedWeight,
      bio: bio.trim() || null,
      instagram_username: instagram.trim() || null,
      country,
      activity_region: activityRegion.trim() || null,
      crew_name: newCrewName,
    };

    // Queue for sync
    await savePendingProfile(profilePayload);

    // 2) Navigate back immediately
    setIsSaving(false);
    navigation.goBack();

    // 3) Try server sync in background (non-blocking)
    (async () => {
      try {
        let uploadedAvatarUrl: string | null | undefined;
        if (avatarUri === '__remove__') {
          uploadedAvatarUrl = null;
        } else if (avatarUri) {
          const uploadResponse = await authService.uploadAvatar(avatarUri);
          uploadedAvatarUrl = uploadResponse.url;
        }

        await authService.updateProfile({
          ...profilePayload,
          ...(uploadedAvatarUrl !== undefined && { avatar_url: uploadedAvatarUrl }),
        });

        // Server succeeded — clear pending
        await clearPendingProfile();

        // Sync crew selection if changed
        if (selectedCrewId && newCrewName !== user?.crew_name) {
          await crewService.setPrimaryCrew(selectedCrewId);
        }
      } catch {
        // Server unreachable — pending data stays in queue for next sync
      }
    })();
  };

  const displayAvatarUri =
    avatarUri === '__remove__' ? null : avatarUri ?? user?.avatar_url ?? null;

  const formatBirthday = (d: Date) =>
    t('profileEdit.birthdayFormat', { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });

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
          <Text style={styles.headerTitle}>{t('profileEdit.title')}</Text>
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
                {t('profileEdit.saveBtn')}
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
            <Text style={styles.fieldLabel}>{t('profileEdit.nickname')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder={t('profileEdit.nicknamePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                maxLength={12}
                returnKeyType="done"
              />
              <Text style={styles.charCount}>{nickname.length}/12</Text>
            </View>
            {nickname.length > 0 && !isValidNickname && (
              <Text style={styles.errorText}>{t('profileEdit.nicknameMinError')}</Text>
            )}
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('profileEdit.bio')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.bioInput}
                value={bio}
                onChangeText={setBio}
                placeholder={t('profileEdit.bioPlaceholder')}
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
            <Text style={styles.fieldLabel}>{t('profileEdit.instagram')}</Text>
            <View style={styles.unitInputRow}>
              <Text style={styles.unitLabel}>@</Text>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder={t('profileEdit.instagramPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                maxLength={30}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Country */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('profileEdit.country')}</Text>
            <TouchableOpacity
              style={styles.selectInput}
              onPress={() => { Keyboard.dismiss(); setShowCountryPicker(true); }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.selectInputText,
                  !country && { color: colors.textTertiary },
                ]}
              >
                {country
                  ? `${getCountryFlag(country)} ${getCountryName(country)}`
                  : t('profileEdit.countryPlaceholder')}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Activity Region */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('profileEdit.region')}</Text>
            <TextInput
              style={styles.textInput}
              value={activityRegion}
              onChangeText={setActivityRegion}
              placeholder={t('profileEdit.regionPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              maxLength={30}
              returnKeyType="done"
            />
          </View>

          {/* Crew display selection */}
          {myCrews.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profileEdit.crewDisplay')}</Text>
              <View style={styles.crewList}>
                {/* "None" option */}
                <TouchableOpacity
                  style={[
                    styles.crewOption,
                    !selectedCrewId && styles.crewOptionSelected,
                  ]}
                  onPress={() => setSelectedCrewId(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="eye-off-outline"
                    size={18}
                    color={!selectedCrewId ? colors.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.crewOptionText,
                      !selectedCrewId && styles.crewOptionTextSelected,
                    ]}
                  >
                    {t('profileEdit.crewNone')}
                  </Text>
                  {!selectedCrewId && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>

                {myCrews.map((crew) => {
                  const isSelected = selectedCrewId === crew.id;
                  return (
                    <TouchableOpacity
                      key={crew.id}
                      style={[
                        styles.crewOption,
                        isSelected && styles.crewOptionSelected,
                      ]}
                      onPress={() => setSelectedCrewId(crew.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.crewBadgeDot,
                          { backgroundColor: crew.badge_color },
                        ]}
                      />
                      <Text
                        style={[
                          styles.crewOptionText,
                          isSelected && styles.crewOptionTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {crew.name}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.crewHint}>{t('profileEdit.crewHint')}</Text>
            </View>
          )}

          {/* Birthday */}
          <View
            style={styles.fieldGroup}
            onLayout={(e) => { birthdayYPosition.current = e.nativeEvent.layout.y; }}
          >
            <Text style={styles.fieldLabel}>{t('profileEdit.birthday')}</Text>
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
                {birthday ? formatBirthday(birthday) : t('profileEdit.birthdayPlaceholder')}
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
                  <Text style={styles.dateConfirmText}>{t('common.confirm')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Height & Weight */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>{t('profileEdit.height')}</Text>
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
              <Text style={styles.fieldLabel}>{t('profileEdit.weight')}</Text>
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
              {t('profileEdit.privacyNote')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country picker modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('profileEdit.countrySelect')}</Text>
            <TouchableOpacity
              onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder={t('profileEdit.countrySearch')}
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              returnKeyType="search"
            />
            {countrySearch.length > 0 && (
              <TouchableOpacity onPress={() => setCountrySearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={COUNTRIES.filter(
              (c) =>
                !countrySearch ||
                c.name.includes(countrySearch) ||
                c.code.toLowerCase().includes(countrySearch.toLowerCase()),
            )}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = country === item.code;
              return (
                <TouchableOpacity
                  style={[styles.countryRow, isSelected && styles.countryRowSelected]}
                  onPress={() => {
                    setCountry(item.code);
                    setShowCountryPicker(false);
                    setCountrySearch('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.countryFlag}>{getCountryFlag(item.code)}</Text>
                  <Text style={[styles.countryName, isSelected && styles.countryNameSelected]}>
                    {item.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.countryDivider} />}
            contentContainerStyle={styles.countryList}
          />

          {country && (
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.clearCountryBtn}
                onPress={() => {
                  setCountry(null);
                  setShowCountryPicker(false);
                  setCountrySearch('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.clearCountryText}>{t('profileEdit.countryDeselect')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
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
      paddingBottom: Platform.OS === 'android' ? 120 : SPACING.xxxl + SPACING.xl,
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

    // Country picker modal
    modalContainer: {
      flex: 1,
      backgroundColor: c.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: SPACING.xl,
      marginVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 0,
      backgroundColor: c.surfaceLight,
      borderRadius: BORDER_RADIUS.md,
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: c.text,
      paddingVertical: SPACING.sm,
    },
    countryList: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl,
    },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.lg,
      gap: SPACING.md,
    },
    countryRowSelected: {
      backgroundColor: c.surfaceLight,
      marginHorizontal: -SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
    },
    countryFlag: {
      fontSize: 24,
    },
    countryName: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    countryNameSelected: {
      fontWeight: '700',
      color: c.primary,
    },
    countryDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    modalFooter: {
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    clearCountryBtn: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    clearCountryText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Crew selection
    crewList: {
      gap: SPACING.sm,
    },
    crewOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    crewOptionSelected: {
      borderColor: c.primary,
      backgroundColor: c.primary + '10',
    },
    crewOptionText: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    crewOptionTextSelected: {
      color: c.primary,
      fontWeight: '700',
    },
    crewBadgeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    crewHint: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      lineHeight: 16,
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
