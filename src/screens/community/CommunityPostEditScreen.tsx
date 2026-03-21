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
  ActionSheetIOS,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import { communityService } from '../../services/communityService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CommunityPostEdit'>;
type Route = RouteProp<HomeStackParamList, 'CommunityPostEdit'>;

const TITLE_MAX_LENGTH = 100;

export default function CommunityPostEditScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { postId, title: initialTitle, content: initialContent, imageUrl, postType } = route.params;

  const [title, setTitle] = useState(initialTitle ?? '');
  const [content, setContent] = useState(initialContent);
  const [imageUri, setImageUri] = useState<string | null>(imageUrl ?? null);
  const [submitting, setSubmitting] = useState(false);

  const hasTitleField = !!initialTitle || initialTitle === '';
  const canSubmit = (hasTitleField ? title.trim().length > 0 : true) && content.trim().length > 0 && !submitting;

  const pickImage = useCallback(async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }, [t]);

  const showImageOptions = useCallback(() => {
    if (Platform.OS === 'ios') {
      const options = [t('common.camera'), t('common.library')];
      if (imageUri) options.push(t('community.removeImage'));
      options.push(t('common.cancel'));
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: imageUri ? options.length - 2 : undefined,
        },
        (idx) => {
          if (idx === 0) pickImage(true);
          else if (idx === 1) pickImage(false);
          else if (imageUri && idx === 2) setImageUri(null);
        },
      );
    } else {
      Alert.alert(
        t('community.addImage'),
        undefined,
        [
          { text: t('common.camera'), onPress: () => pickImage(true) },
          { text: t('common.library'), onPress: () => pickImage(false) },
          ...(imageUri ? [{ text: t('community.removeImage'), style: 'destructive' as const, onPress: () => setImageUri(null) }] : []),
          { text: t('common.cancel'), style: 'cancel' as const },
        ],
      );
    }
  }, [imageUri, pickImage, t]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length === 0) {
      Alert.alert(t('common.notification'), t('community.titleRequired'));
      return;
    }

    setSubmitting(true);
    try {
      let uploadedImageUrl: string | undefined;
      // Only upload if it's a new local file
      if (imageUri && imageUri.startsWith('file://')) {
        uploadedImageUrl = await communityService.uploadImage(imageUri);
      } else if (imageUri) {
        uploadedImageUrl = imageUri; // existing remote URL
      }

      await communityService.updatePost(postId, {
        title: trimmedTitle,
        content: trimmedContent,
        image_url: uploadedImageUrl,
      });
      navigation.goBack();
    } catch {
      Alert.alert(t('common.errorTitle'), t('community.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, title, content, imageUri, postId, navigation, t]);

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
            <Text style={styles.headerTitle}>{t('community.editPost')}</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.6}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                  {t('common.save')}
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
            {/* Post type (read only) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('community.postType')}</Text>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{postType}</Text>
              </View>
            </View>

            {/* Title */}
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

            {/* Content */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('community.postContent')}</Text>
              <TextInput
                style={styles.contentInput}
                placeholder={t('community.contentPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Image */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('community.imageLabel')}</Text>
              {imageUri ? (
                <TouchableOpacity onPress={showImageOptions} activeOpacity={0.8}>
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  <View style={styles.imageOverlay}>
                    <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.imagePickerBtn}
                  onPress={showImageOptions}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={28} color={colors.textTertiary} />
                  <Text style={styles.imagePickerText}>{t('community.addImage')}</Text>
                </TouchableOpacity>
              )}
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
    scrollContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 40,
      gap: SPACING.xxl,
    },

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

    section: {
      gap: SPACING.sm,
    },
    sectionLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },

    typeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
    },
    typeBadgeText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },

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

    imagePickerBtn: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      paddingVertical: SPACING.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    imagePickerText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },
    imagePreview: {
      width: '100%',
      height: 200,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.surface,
    },
    imageOverlay: {
      position: 'absolute',
      top: SPACING.sm,
      right: SPACING.sm,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
