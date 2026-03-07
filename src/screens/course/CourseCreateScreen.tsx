import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { courseService } from '../../services/courseService';
import { useCourseStore } from '../../stores/courseStore';
import { savePendingCourse, removePendingCourse } from '../../services/pendingSyncService';
import { Ionicons } from '../../lib/icons';
import Button from '../../components/common/Button';
import RouteMapView from '../../components/map/RouteMapView';
import { formatDistance } from '../../utils/format';
import type { CourseStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

type CreateRoute = RouteProp<CourseStackParamList, 'CourseCreate'>;

const MIN_COURSE_DISTANCE_M = 500;

export default function CourseCreateScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<CreateRoute>();
  const {
    runRecordId,
    routePoints,
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    isLoop,
  } = route.params;

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courseType, setCourseType] = useState<'normal' | 'loop'>(isLoop ? 'loop' : 'normal');
  const [lapCount, setLapCount] = useState(1);

  const handleCreate = async () => {
    if (distanceMeters < MIN_COURSE_DISTANCE_M) {
      Alert.alert(t('common.notification'), t('course.create.minDistanceError'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('common.notification'), t('course.create.courseNameRequired'));
      return;
    }

    setIsSubmitting(true);

    const coursePayload = {
      run_record_id: runRecordId,
      title: title.trim(),
      description: description.trim() || undefined,
      route_geometry: {
        type: 'LineString' as const,
        coordinates: routePoints.length >= 2
          ? routePoints.map((p) => [p.longitude, p.latitude, 0])
          : [[127.0, 37.5, 0], [127.0001, 37.5001, 0]],
      },
      distance_meters: Math.max(Math.round(distanceMeters), 1),
      estimated_duration_seconds: Math.max(Math.round(durationSeconds), 1),
      elevation_gain_meters: Math.round(elevationGainMeters),
      elevation_profile: [],
      is_public: isPublic,
      tags: [],
      ...(courseType === 'loop' ? { course_type: 'loop', lap_count: lapCount } : {}),
    };

    const pendingId = `local-${Date.now()}`;

    // 1) Save locally first (instant)
    await savePendingCourse({
      id: pendingId,
      payload: coursePayload,
      createdAt: new Date().toISOString(),
    });

    // 2) Navigate back immediately
    setIsSubmitting(false);
    Alert.alert(t('course.create.courseSaved'), t('course.create.courseSavedMsg', { title: title.trim() }), [
      {
        text: t('common.confirm'),
        onPress: () => {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'CourseList' }],
            }),
          );
        },
      },
    ]);

    // 3) Try server sync in background (non-blocking)
    (async () => {
      try {
        await courseService.createCourse(coursePayload as unknown as Parameters<typeof courseService.createCourse>[0]);
        await removePendingCourse(pendingId);
        // Refresh course list silently
        useCourseStore.getState().fetchCourses().catch(() => {});
      } catch {
        // Server unreachable — pending data stays in queue
      }
    })();
  };

  const isDisabled = isSubmitting || !title.trim();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('course.create.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Map preview with rounded corners */}
        <View style={styles.mapWrapper}>
          <RouteMapView routePoints={routePoints} style={styles.mapPreview} />
        </View>

        {/* Route Info Summary */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>{formatDistance(distanceMeters)}</Text>
            <Text style={styles.infoLabel}>{t('course.detail.distance')}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>+{Math.round(elevationGainMeters)}m</Text>
            <Text style={styles.infoLabel}>{t('course.detail.elevationGain')}</Text>
          </View>
        </View>

        {/* Course Type (shown when loop detected) */}
        {isLoop && (
          <View style={styles.courseTypeSection}>
            <Text style={styles.inputLabel}>{t('course.create.courseType')}</Text>
            <View style={styles.courseTypeRow}>
              <TouchableOpacity
                style={[
                  styles.courseTypeBtn,
                  courseType === 'normal' && styles.courseTypeBtnActive,
                ]}
                onPress={() => setCourseType('normal')}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-forward" size={16} color={courseType === 'normal' ? COLORS.white : colors.textSecondary} />
                <Text style={[styles.courseTypeBtnText, courseType === 'normal' && styles.courseTypeBtnTextActive]}>{t('course.create.oneWay')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.courseTypeBtn,
                  courseType === 'loop' && styles.courseTypeBtnActive,
                ]}
                onPress={() => setCourseType('loop')}
                activeOpacity={0.7}
              >
                <Ionicons name="repeat" size={16} color={courseType === 'loop' ? COLORS.white : colors.textSecondary} />
                <Text style={[styles.courseTypeBtnText, courseType === 'loop' && styles.courseTypeBtnTextActive]}>{t('course.create.roundTrip')}</Text>
              </TouchableOpacity>
            </View>

            {courseType === 'loop' && (
              <View style={styles.lapCountRow}>
                <Text style={styles.lapCountLabel}>{t('course.create.lapCount')}</Text>
                <View style={styles.lapCountControls}>
                  <TouchableOpacity
                    style={[styles.lapCountBtn, lapCount <= 1 && styles.lapCountBtnDisabled]}
                    onPress={() => setLapCount(Math.max(1, lapCount - 1))}
                    disabled={lapCount <= 1}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={18} color={lapCount <= 1 ? colors.textTertiary : colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.lapCountValue}>{lapCount}</Text>
                  <TouchableOpacity
                    style={styles.lapCountBtn}
                    onPress={() => setLapCount(Math.min(10, lapCount + 1))}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Title Input -- bottom border style */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('course.create.courseNameLabel')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('course.create.courseNameExample')}
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={30}
          />
          <Text style={styles.charCount}>{title.length}/30</Text>
        </View>

        {/* Description Input -- bottom border style */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('course.create.description')}</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder={t('course.create.descriptionPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Public Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>{t('course.create.publicCourse')}</Text>
            <Text style={styles.toggleDescription}>
              {t('course.create.publicHintLong')}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>

        {/* Green submit button */}
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
            {isSubmitting ? t('course.create.registering') : t('course.create.register')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
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

  // -- Header --
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: FONT_SIZES.xxl,
    color: c.text,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
  },
  headerSpacer: {
    width: 40,
  },

  // -- Map preview with rounded corners --
  mapWrapper: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  mapPreview: {
    height: 200,
    borderRadius: BORDER_RADIUS.xl,
  },

  // -- Route Info Summary --
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xl,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  infoDivider: {
    width: 1,
    height: 32,
    backgroundColor: c.divider,
  },
  infoValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  infoLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- Course Type Selector --
  courseTypeSection: {
    gap: SPACING.md,
  },
  courseTypeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  courseTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  courseTypeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  courseTypeBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  courseTypeBtnTextActive: {
    color: COLORS.white,
  },
  lapCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  lapCountLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  lapCountControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  lapCountBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  lapCountBtnDisabled: {
    opacity: 0.4,
  },
  lapCountValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'] as any,
    minWidth: 28,
    textAlign: 'center',
  },

  // -- Input fields: card bg, bottom border style --
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
    borderWidth: 0,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    fontSize: FONT_SIZES.lg,
    color: c.text,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 88,
    borderBottomWidth: 2,
    borderBottomColor: c.border,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // -- Public Toggle --
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  toggleInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  toggleLabel: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: c.text,
  },
  toggleDescription: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    marginTop: SPACING.xs,
    lineHeight: 18,
  },

  // -- Green submit button with black text --
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
