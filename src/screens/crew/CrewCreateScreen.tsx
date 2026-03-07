import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import { crewService } from '../../services/crewService';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CrewCreate'>;

const BADGE_COLORS = [
  '#FF7A33',
  '#FF5252',
  '#34C759',
  '#007AFF',
  '#AF52DE',
  '#FF9500',
] as const;

export default function CrewCreateScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('');
  const [recurringSchedule, setRecurringSchedule] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(BADGE_COLORS[0]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const created = await crewService.createCrew({
        name: name.trim(),
        description: description.trim() || undefined,
        region: region.trim() || undefined,
        recurring_schedule: recurringSchedule.trim() || undefined,
        meeting_point: meetingPoint.trim() || undefined,
        max_members: maxMembers ? parseInt(maxMembers, 10) : undefined,
        badge_color: selectedColor,
        badge_icon: 'people',
        requires_approval: requiresApproval,
      });

      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      setTimeout(() => {
        navigation.navigate('CrewDetail', { crewId: created.id });
      }, 100);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'CREW_LIMIT_REACHED') {
        Alert.alert(t('common.notification'), t('crew.crewLimitReached'));
      } else {
        Alert.alert(t('common.errorTitle'), t('crew.createFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    name,
    description,
    region,
    recurringSchedule,
    meetingPoint,
    maxMembers,
    selectedColor,
    requiresApproval,
    navigation,
    t,
  ]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('crew.createCrew')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Crew Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                {t('crew.crewName')} <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t('crew.crewNamePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={name}
                onChangeText={setName}
                maxLength={100}
                returnKeyType="next"
              />
              <Text style={styles.charCount}>{name.length}/100</Text>
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.introduction')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('crew.introductionPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/2000</Text>
            </View>

            {/* Region */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.region')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('crew.regionPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={region}
                onChangeText={setRegion}
                maxLength={50}
                returnKeyType="next"
              />
            </View>

            {/* Recurring Schedule */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.regularSchedule')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('crew.schedulePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={recurringSchedule}
                onChangeText={setRecurringSchedule}
                returnKeyType="next"
              />
            </View>

            {/* Meeting Point */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.meetingPlace')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('crew.meetingPlacePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={meetingPoint}
                onChangeText={setMeetingPoint}
                returnKeyType="next"
              />
            </View>

            {/* Max Members */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.maxParticipants')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('crew.noLimit')}
                placeholderTextColor={colors.textTertiary}
                value={maxMembers}
                onChangeText={(text) => {
                  const numeric = text.replace(/[^0-9]/g, '');
                  setMaxMembers(numeric);
                }}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>

            {/* Join Type */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.joinType')}</Text>
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

            {/* Badge Color */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('crew.badgeColor')}</Text>
              <View style={styles.colorRow}>
                {BADGE_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorCircleSelected,
                    ]}
                    onPress={() => setSelectedColor(color)}
                    activeOpacity={0.7}
                  >
                    {selectedColor === color && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>{t('crew.createCrew')}</Text>
              )}
            </TouchableOpacity>
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
    flex: { flex: 1 },
    scrollView: { flex: 1 },
    contentContainer: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 120,
      gap: SPACING.xl,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    headerSpacer: { width: 40 },

    // Form fields
    fieldGroup: { gap: SPACING.sm },
    label: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    required: {
      color: c.error,
      fontWeight: '700',
    },
    input: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
    },
    textArea: {
      minHeight: 100,
      paddingTop: SPACING.md,
    },
    charCount: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
      textAlign: 'right',
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

    // Color picker
    colorRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    colorCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    colorCircleSelected: {
      borderWidth: 3,
      borderColor: c.text,
    },

    // Submit
    submitButton: {
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.md,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
