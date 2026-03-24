import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '../../lib/icons';
import { courseService } from '../../services/courseService';
import { useLiveGroupRunStore } from '../../stores/liveGroupRunStore';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import type { MyCourse } from '../../types/api';
import { formatDistance } from '../../utils/format';
import {
  COLORS,
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'GroupRunCreate'>;

export default function GroupRunCreateScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { createGroupRun } = useLiveGroupRunStore();

  const [title, setTitle] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [selectedCourse, setSelectedCourse] = useState<MyCourse | null>(null);
  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCourseSelect, setShowCourseSelect] = useState(false);

  useEffect(() => {
    loadMyCourses();
  }, []);

  const loadMyCourses = async () => {
    try {
      const courses = await courseService.getMyCourses();
      setMyCourses(courses);
    } catch {
      Alert.alert(t('common.error'), t('common.errorRetry'));
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const handleCreate = useCallback(async () => {
    if (!selectedCourse) {
      Alert.alert(t('common.notification'), t('liveGroupRun.selectCourseRequired'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('common.notification'), t('liveGroupRun.titleRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const groupRunId = await createGroupRun({
        course_id: selectedCourse.id,
        title: title.trim(),
        max_participants: maxParticipants,
      });
      navigation.replace('GroupRunLobby', { groupRunId });
    } catch {
      Alert.alert(t('common.error'), t('liveGroupRun.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedCourse, title, maxParticipants, createGroupRun, navigation, t]);

  const isDisabled = isSubmitting || !title.trim() || !selectedCourse;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('liveGroupRun.createTitle')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Course Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('liveGroupRun.course')}</Text>
          {isLoadingCourses ? (
            <ActivityIndicator size="small" color={colors.text} style={styles.courseLoading} />
          ) : showCourseSelect ? (
            <View style={styles.courseList}>
              {myCourses.length === 0 ? (
                <Text style={styles.noCourses}>{t('liveGroupRun.noCourses')}</Text>
              ) : (
                myCourses.map((course) => (
                  <TouchableOpacity
                    key={course.id}
                    style={[
                      styles.courseItem,
                      selectedCourse?.id === course.id && styles.courseItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedCourse(course);
                      setShowCourseSelect(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="map-outline"
                      size={18}
                      color={selectedCourse?.id === course.id ? COLORS.white : colors.primary}
                    />
                    <View style={styles.courseItemContent}>
                      <Text
                        style={[
                          styles.courseItemTitle,
                          selectedCourse?.id === course.id && styles.courseItemTitleSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {course.title}
                      </Text>
                      <Text
                        style={[
                          styles.courseItemDistance,
                          selectedCourse?.id === course.id && styles.courseItemDistanceSelected,
                        ]}
                      >
                        {formatDistance(course.distance_meters)}
                      </Text>
                    </View>
                    {selectedCourse?.id === course.id && (
                      <Ionicons name="checkmark" size={18} color={COLORS.white} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.courseSelector}
              onPress={() => setShowCourseSelect(true)}
              activeOpacity={0.7}
            >
              {selectedCourse ? (
                <View style={styles.selectedCourseRow}>
                  <Ionicons name="map-outline" size={18} color={colors.primary} />
                  <Text style={styles.selectedCourseText} numberOfLines={1}>
                    {selectedCourse.title}
                  </Text>
                  <Text style={styles.selectedCourseDistance}>
                    {formatDistance(selectedCourse.distance_meters)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.coursePlaceholder}>
                  {t('liveGroupRun.selectCourse')}
                </Text>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Title Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('liveGroupRun.titleLabel')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('liveGroupRun.titlePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={30}
          />
          <Text style={styles.charCount}>{title.length}/30</Text>
        </View>

        {/* Max Participants */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('liveGroupRun.maxParticipants')}</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, maxParticipants <= 2 && styles.counterBtnDisabled]}
              onPress={() => setMaxParticipants(Math.max(2, maxParticipants - 1))}
              disabled={maxParticipants <= 2}
              activeOpacity={0.7}
            >
              <Ionicons
                name="remove"
                size={18}
                color={maxParticipants <= 2 ? colors.textTertiary : colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.counterValue}>{maxParticipants}</Text>
            <TouchableOpacity
              style={[styles.counterBtn, maxParticipants >= 50 && styles.counterBtnDisabled]}
              onPress={() => setMaxParticipants(Math.min(50, maxParticipants + 1))}
              disabled={maxParticipants >= 50}
              activeOpacity={0.7}
            >
              <Ionicons
                name="add"
                size={18}
                color={maxParticipants >= 50 ? colors.textTertiary : colors.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            isDisabled && styles.submitButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={isDisabled}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.submitButtonText,
              isDisabled && styles.submitButtonTextDisabled,
            ]}
          >
            {isSubmitting
              ? t('liveGroupRun.creating')
              : t('liveGroupRun.createButton')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.xl,
    },

    // Input groups
    inputGroup: {
      gap: SPACING.sm,
    },
    inputLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    textInput: {
      backgroundColor: c.card,
      borderBottomWidth: 2,
      borderBottomColor: c.border,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xs,
      fontSize: FONT_SIZES.lg,
      color: c.text,
      fontWeight: '500',
    },
    charCount: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },

    // Course selector
    courseLoading: {
      paddingVertical: SPACING.xl,
    },
    courseSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      minHeight: 52,
    },
    coursePlaceholder: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
    },
    selectedCourseRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginRight: SPACING.sm,
    },
    selectedCourseText: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    selectedCourseDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },

    // Course list
    courseList: {
      gap: SPACING.sm,
    },
    courseItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      gap: SPACING.md,
    },
    courseItemSelected: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    courseItemContent: {
      flex: 1,
      gap: 2,
    },
    courseItemTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    courseItemTitleSelected: {
      color: COLORS.white,
    },
    courseItemDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    courseItemDistanceSelected: {
      color: 'rgba(255,255,255,0.8)',
    },
    noCourses: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      textAlign: 'center',
      paddingVertical: SPACING.xl,
    },

    // Counter
    counterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
    },
    counterBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    counterBtnDisabled: {
      opacity: 0.4,
    },
    counterValue: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
      minWidth: 36,
      textAlign: 'center',
    },

    // Submit
    submitButton: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.lg + 2,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.glow,
    },
    submitButtonDisabled: {
      backgroundColor: c.surfaceLight,
      shadowOpacity: 0,
      elevation: 0,
    },
    submitButtonText: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: COLORS.white,
      letterSpacing: 0.5,
    },
    submitButtonTextDisabled: {
      color: c.textTertiary,
    },
  });
