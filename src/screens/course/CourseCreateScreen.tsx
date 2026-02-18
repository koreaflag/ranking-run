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
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { courseService } from '../../services/courseService';
import { useCourseStore } from '../../stores/courseStore';
import Button from '../../components/common/Button';
import RouteMapView from '../../components/map/RouteMapView';
import { formatDistance } from '../../utils/format';
import type { CourseStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

type CreateRoute = RouteProp<CourseStackParamList, 'CourseCreate'>;

export default function CourseCreateScreen() {
  const navigation = useNavigation();
  const route = useRoute<CreateRoute>();
  const {
    runRecordId,
    routePoints,
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
  } = route.params;

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('알림', '코스 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await courseService.createCourse({
        run_record_id: runRecordId,
        title: title.trim(),
        description: description.trim() || undefined,
        route_geometry: {
          type: 'LineString',
          coordinates: routePoints.length >= 2
            ? routePoints.map((p) => [p.longitude, p.latitude, 0])
            : [[127.0, 37.5, 0], [127.0001, 37.5001, 0]],
        },
        distance_meters: Math.max(distanceMeters, 1),
        estimated_duration_seconds: Math.max(durationSeconds, 1),
        elevation_gain_meters: elevationGainMeters,
        elevation_profile: [],
        is_public: isPublic,
        tags: [],
      });

      // Refresh course list then go back to it
      await useCourseStore.getState().fetchCourses();
      Alert.alert('코스 등록 완료', `"${response.title}" 코스가 등록되었습니다.`, [
        {
          text: '확인',
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
    } catch {
      Alert.alert('앗...!', '코스 등록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
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
          <Text style={styles.headerTitle}>코스 등록</Text>
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
            <Text style={styles.infoLabel}>거리</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>+{Math.round(elevationGainMeters)}m</Text>
            <Text style={styles.infoLabel}>고도 상승</Text>
          </View>
        </View>

        {/* Title Input -- bottom border style */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>코스 이름 *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="예: 한강 반포대교 왕복"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={30}
          />
          <Text style={styles.charCount}>{title.length}/30</Text>
        </View>

        {/* Description Input -- bottom border style */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>설명</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="코스에 대한 설명을 입력해주세요"
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
            <Text style={styles.toggleLabel}>공개 코스</Text>
            <Text style={styles.toggleDescription}>
              다른 러너들이 이 코스를 검색하고 달릴 수 있습니다
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
            {isSubmitting ? '등록 중...' : '코스 등록하기'}
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
