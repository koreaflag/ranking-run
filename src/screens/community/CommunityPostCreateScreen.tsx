import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CommunityPostType } from '../../types/api';
import { communityService } from '../../services/communityService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CommunityPostCreate'>;
type Route = RouteProp<CommunityStackParamList, 'CommunityPostCreate'>;

// ---- Post type options ----

interface PostTypeOption {
  labelKey: string;
  value: CommunityPostType;
  icon: keyof typeof Ionicons.glyphMap;
}

const POST_TYPE_OPTIONS: PostTypeOption[] = [
  { labelKey: 'community.categoryGeneral', value: 'general', icon: 'chatbubble-outline' },
  { labelKey: 'community.categoryCrewPromo', value: 'crew_promo', icon: 'people-outline' },
  { labelKey: 'community.categoryQuestion', value: 'question', icon: 'help-circle-outline' },
];

const TITLE_MAX_LENGTH = 100;
const MAX_IMAGES = 10;

// ---- Main Screen ----

export default function CommunityPostCreateScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const crewId = route.params?.crewId ?? undefined;

  const [postType, setPostType] = useState<CommunityPostType>(
    crewId ? 'general' : 'general',
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = crewId
    ? content.trim().length > 0 && !submitting
    : title.trim().length > 0 && content.trim().length > 0 && !submitting;

  // ---- Image picker ----

  const pickImages = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
      return;
    }

    const remaining = MAX_IMAGES - imageUris.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      setImageUris((prev) => [...prev, ...newUris].slice(0, MAX_IMAGES));
    }
  }, [t, imageUris.length]);

  const removeImage = useCallback((index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ---- Submit ----

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!crewId && trimmedTitle.length === 0) {
      Alert.alert(t('common.notification'), t('community.titleRequired'));
      return;
    }
    if (trimmedContent.length === 0) {
      Alert.alert(t('common.notification'), t('community.contentRequired'));
      return;
    }

    setSubmitting(true);
    try {
      let uploadedImageUrls: string[] | undefined;
      if (imageUris.length > 0) {
        const urls = await Promise.all(
          imageUris.map((uri) => communityService.uploadImage(uri)),
        );
        uploadedImageUrls = urls;
      }

      await communityService.createPost({
        title: crewId ? undefined : trimmedTitle,
        content: trimmedContent,
        post_type: crewId ? 'general' : postType,
        crew_id: crewId,
        image_url: uploadedImageUrls?.[0],
        image_urls: uploadedImageUrls,
      });
      navigation.goBack();
    } catch {
      Alert.alert(t('common.errorTitle'), t('community.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, title, content, postType, crewId, imageUris, navigation, t]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('community.write')}</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.6}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.submitText,
                    !canSubmit && styles.submitTextDisabled,
                  ]}
                >
                  {t('community.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Post type selector — hide for crew posts */}
            {!crewId && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('community.postType')}</Text>
                <View style={styles.typeRow}>
                  {POST_TYPE_OPTIONS.map((option) => {
                    const isActive = postType === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.typeChip,
                          isActive && styles.typeChipActive,
                        ]}
                        onPress={() => setPostType(option.value)}
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={isActive ? '#FFFFFF' : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.typeChipText,
                            isActive && styles.typeChipTextActive,
                          ]}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Title — hidden for crew posts */}
            {!crewId && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('community.postTitle')}</Text>
                <TextInput
                  style={styles.titleInput}
                  placeholder={t('community.titlePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={TITLE_MAX_LENGTH}
                  returnKeyType="next"
                />
                <Text style={styles.charCount}>
                  {title.length}/{TITLE_MAX_LENGTH}
                </Text>
              </View>
            )}

            {/* Content */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('community.postContent')}</Text>
              <TextInput
                style={styles.contentInput}
                placeholder={crewId ? t('community.crewContentPlaceholder') : t('community.contentPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
              />
              {/* Inline toolbar */}
              <View style={styles.editorToolbar}>
                <TouchableOpacity
                  style={styles.toolbarIconBtn}
                  onPress={pickImages}
                  activeOpacity={0.7}
                  disabled={imageUris.length >= MAX_IMAGES}
                >
                  <Ionicons
                    name="image-outline"
                    size={22}
                    color={imageUris.length > 0 ? colors.primary : colors.textTertiary}
                  />
                </TouchableOpacity>
                {imageUris.length > 0 && (
                  <Text style={styles.imageCountText}>
                    {imageUris.length}/{MAX_IMAGES}
                  </Text>
                )}
              </View>
              {/* Image thumbnails */}
              {imageUris.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.imageRow}
                >
                  {imageUris.map((uri, index) => (
                    <View key={uri} style={styles.imageThumbWrap}>
                      <Image source={{ uri }} style={styles.imageThumb} />
                      <TouchableOpacity
                        style={styles.imageRemoveBtn}
                        onPress={() => removeImage(index)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close-circle" size={20} color="rgba(0,0,0,0.6)" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 40,
      gap: SPACING.xxl,
    },

    // Header
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
    submitText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.primary,
    },
    submitTextDisabled: {
      opacity: 0.35,
    },

    // Sections
    section: {
      gap: SPACING.sm,
    },
    sectionLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },

    // Type selector
    typeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    typeChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    typeChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    typeChipTextActive: {
      color: '#FFFFFF',
    },

    // Title input
    titleInput: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    charCount: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      textAlign: 'right',
    },

    // Content input
    contentInput: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
      minHeight: 200,
      borderWidth: 1,
      borderColor: c.border,
      lineHeight: 22,
    },

    // Editor toolbar
    editorToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: SPACING.xs,
      gap: SPACING.sm,
    },
    toolbarIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    imageCountText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Multi-image thumbnails
    imageRow: {
      gap: SPACING.sm,
      paddingTop: SPACING.xs,
    },
    imageThumbWrap: {
      position: 'relative',
    },
    imageThumb: {
      width: 80,
      height: 80,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
    },
    imageRemoveBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
    },

  });
