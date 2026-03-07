import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActionSheetIOS,
  Dimensions,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CrewItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CrewEdit'>;
type Route = RouteProp<CommunityStackParamList, 'CrewEdit'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const COVER_HEIGHT = 180;

const BADGE_COLORS = [
  '#FF7A33', '#FF4757', '#3B82F6', '#10B981',
  '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4',
];

export default function CrewEditScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { crewId } = route.params;

  const [crew, setCrew] = useState<CrewItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [badgeColor, setBadgeColor] = useState('#FF7A33');
  const [region, setRegion] = useState('');
  const [recurringSchedule, setRecurringSchedule] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await crewService.getCrew(crewId);
        setCrew(data);
        setName(data.name);
        setDescription(data.description ?? '');
        setCoverUri(data.cover_image_url);
        setLogoUri(data.logo_url);
        setBadgeColor(data.badge_color || '#FF7A33');
        setRegion(data.region ?? '');
        setRecurringSchedule(data.recurring_schedule ?? '');
        setMeetingPoint(data.meeting_point ?? '');
        setMaxMembers(data.max_members ? String(data.max_members) : '');
        setRequiresApproval(data.requires_approval ?? false);
      } catch {
        Alert.alert(t('common.errorTitle'), t('crew.loadError'));
        navigation.goBack();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [crewId, navigation, t]);

  const pickImage = useCallback(async (useCamera: boolean, target: 'cover' | 'logo') => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
      return;
    }

    const aspect: [number, number] = target === 'cover' ? [16, 9] : [1, 1];
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8, aspect })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
          aspect,
        });

    if (!result.canceled && result.assets[0]) {
      if (target === 'cover') setCoverUri(result.assets[0].uri);
      else setLogoUri(result.assets[0].uri);
    }
  }, [t]);

  const showImagePicker = useCallback((target: 'cover' | 'logo') => {
    const currentUri = target === 'cover' ? coverUri : logoUri;
    if (Platform.OS === 'ios') {
      const options = [t('common.camera'), t('common.library')];
      if (currentUri) options.push(t('community.removeImage'));
      options.push(t('common.cancel'));
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: currentUri ? options.length - 2 : undefined,
        },
        (idx) => {
          if (idx === 0) pickImage(true, target);
          else if (idx === 1) pickImage(false, target);
          else if (currentUri && idx === 2) {
            if (target === 'cover') setCoverUri(null);
            else setLogoUri(null);
          }
        },
      );
    } else {
      Alert.alert(
        target === 'cover' ? t('crew.coverImage') : t('crew.logoImage'),
        undefined,
        [
          { text: t('common.camera'), onPress: () => pickImage(true, target) },
          { text: t('common.library'), onPress: () => pickImage(false, target) },
          ...(currentUri
            ? [{ text: t('community.removeImage'), style: 'destructive' as const, onPress: () => {
                if (target === 'cover') setCoverUri(null);
                else setLogoUri(null);
              }}]
            : []),
          { text: t('common.cancel'), style: 'cancel' as const },
        ],
      );
    }
  }, [coverUri, logoUri, pickImage, t]);

  const handleDisband = useCallback(() => {
    Alert.alert(
      t('crew.disbandTitle'),
      t('crew.disbandMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('crew.disband'),
          style: 'destructive',
          onPress: async () => {
            try {
              await crewService.deleteCrew(crewId);
              // Go back to the root (home or community)
              navigation.popToTop();
            } catch {
              Alert.alert(t('common.errorTitle'), t('crew.disbandFailed'));
            }
          },
        },
      ],
    );
  }, [crewId, navigation, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert(t('common.notification'), t('crew.nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      let coverUrl = coverUri;
      let logoUrl = logoUri;

      // Upload new cover if local file
      if (coverUri && coverUri.startsWith('file://')) {
        coverUrl = await crewService.uploadImage(coverUri);
      }
      // Upload new logo if local file
      if (logoUri && logoUri.startsWith('file://')) {
        logoUrl = await crewService.uploadImage(logoUri);
      }

      await crewService.updateCrew(crewId, {
        name: name.trim(),
        description: description.trim() || undefined,
        cover_image_url: coverUrl ?? undefined,
        logo_url: logoUrl ?? undefined,
        badge_color: badgeColor,
        region: region.trim() || undefined,
        recurring_schedule: recurringSchedule.trim() || undefined,
        meeting_point: meetingPoint.trim() || undefined,
        max_members: maxMembers ? parseInt(maxMembers, 10) : undefined,
        requires_approval: requiresApproval,
      });

      navigation.goBack();
    } catch {
      Alert.alert(t('common.errorTitle'), t('crew.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [crewId, name, description, coverUri, logoUri, badgeColor, region, recurringSchedule, meetingPoint, maxMembers, requiresApproval, navigation, t]);

  if (isLoading) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.6} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.editCrew')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.6} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.editCrew')}</Text>
            <TouchableOpacity onPress={handleSave} activeOpacity={0.6} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.saveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Cover Image */}
            <TouchableOpacity
              style={styles.coverContainer}
              onPress={() => showImagePicker('cover')}
              activeOpacity={0.8}
            >
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverPlaceholder, { backgroundColor: badgeColor + '30' }]}>
                  <Ionicons name="image-outline" size={32} color={badgeColor} />
                  <Text style={[styles.coverPlaceholderText, { color: badgeColor }]}>
                    {t('crew.addCoverImage')}
                  </Text>
                </View>
              )}
              <View style={styles.coverEditBadge}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Logo Image - overlapping cover */}
            <View style={styles.logoSection}>
              <TouchableOpacity
                style={styles.logoContainer}
                onPress={() => showImagePicker('logo')}
                activeOpacity={0.8}
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoImage} />
                ) : (
                  <View style={[styles.logoPlaceholder, { backgroundColor: badgeColor }]}>
                    <Ionicons
                      name={(crew?.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
                      size={28}
                      color="#FFFFFF"
                    />
                  </View>
                )}
                <View style={styles.logoEditBadge}>
                  <Ionicons name="camera" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.formContainer}>
              {/* Crew Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.crewName')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('crew.namePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={100}
                />
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.description')}</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('crew.descriptionPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />
              </View>

              {/* Badge Color */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.badgeColor')}</Text>
                <View style={styles.colorRow}>
                  {BADGE_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        badgeColor === color && styles.colorCircleSelected,
                      ]}
                      onPress={() => setBadgeColor(color)}
                      activeOpacity={0.7}
                    >
                      {badgeColor === color && (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Region */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.region')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={region}
                  onChangeText={setRegion}
                  placeholder={t('crew.regionPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={50}
                />
              </View>

              {/* Schedule */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.recurringSchedule')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={recurringSchedule}
                  onChangeText={setRecurringSchedule}
                  placeholder={t('crew.schedulePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={200}
                />
              </View>

              {/* Meeting Point */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.meetingPoint')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={meetingPoint}
                  onChangeText={setMeetingPoint}
                  placeholder={t('crew.meetingPointPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={200}
                />
              </View>

              {/* Max Members */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.maxMembers')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={maxMembers}
                  onChangeText={(v) => setMaxMembers(v.replace(/[^0-9]/g, ''))}
                  placeholder={t('crew.maxMembersPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>

              {/* Join Type */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('crew.joinType')}</Text>
                <View style={styles.joinTypeRow}>
                  <TouchableOpacity
                    style={[styles.joinTypeBtn, !requiresApproval && styles.joinTypeBtnActive]}
                    onPress={() => setRequiresApproval(false)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="enter-outline"
                      size={18}
                      color={!requiresApproval ? colors.primary : colors.textTertiary}
                    />
                    <Text style={[styles.joinTypeBtnText, !requiresApproval && styles.joinTypeBtnTextActive]}>
                      {t('crew.freeJoin')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.joinTypeBtn, requiresApproval && styles.joinTypeBtnActive]}
                    onPress={() => setRequiresApproval(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={requiresApproval ? colors.primary : colors.textTertiary}
                    />
                    <Text style={[styles.joinTypeBtnText, requiresApproval && styles.joinTypeBtnTextActive]}>
                      {t('crew.requiresApproval')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Disband Crew (owner only) */}
              {crew?.my_role === 'owner' && (
                <TouchableOpacity
                  style={styles.disbandButton}
                  onPress={handleDisband}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={styles.disbandText}>{t('crew.disband')}</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 80 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    saveText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.primary,
    },

    // Cover image
    coverContainer: {
      width: SCREEN_WIDTH,
      height: COVER_HEIGHT,
      position: 'relative',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },
    coverPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    coverPlaceholderText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
    },
    coverEditBadge: {
      position: 'absolute',
      bottom: SPACING.md,
      right: SPACING.md,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Logo
    logoSection: {
      alignItems: 'center',
      marginTop: -36,
      marginBottom: SPACING.md,
      zIndex: 1,
    },
    logoContainer: {
      position: 'relative',
    },
    logoImage: {
      width: 72,
      height: 72,
      borderRadius: 22,
      borderWidth: 3,
      borderColor: c.background,
    },
    logoPlaceholder: {
      width: 72,
      height: 72,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: c.background,
    },
    logoEditBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: c.background,
    },

    // Form
    formContainer: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.xl,
    },
    fieldGroup: {
      gap: SPACING.sm,
    },
    fieldLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    textInput: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    textArea: {
      minHeight: 100,
      lineHeight: 22,
    },

    // Color picker
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.md,
    },
    colorCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    colorCircleSelected: {
      borderWidth: 3,
      borderColor: c.text,
    },

    // Join type toggle
    joinTypeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    joinTypeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    joinTypeBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '10',
    },
    joinTypeBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },
    joinTypeBtnTextActive: {
      color: c.primary,
      fontWeight: '700',
    },

    // Disband
    disbandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1.5,
      borderColor: c.error + '30',
      backgroundColor: c.error + '08',
      marginTop: SPACING.xl,
    },
    disbandText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.error,
    },
  });
