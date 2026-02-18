import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useCourseStore } from '../../stores/courseStore';
import { useAuthStore } from '../../stores/authStore';
import EmptyState from '../../components/common/EmptyState';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { MyPageStackParamList } from '../../types/navigation';
import type { MyCourse } from '../../types/api';
import { formatDistance, formatNumber, formatDate, formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Nav = NativeStackNavigationProp<MyPageStackParamList, 'MyCourses'>;

function MyCourseCard({
  course,
  nickname,
  onEdit,
  onDetail,
}: {
  course: MyCourse;
  nickname: string;
  onEdit: (course: MyCourse) => void;
  onDetail: (courseId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={toggleExpand}
      activeOpacity={0.7}
    >
      {/* Summary (always visible) */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {course.title}
          </Text>
          <Text style={styles.cardMeta}>
            {nickname} · {formatDate(course.created_at)}
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <View
            style={[
              styles.visibilityBadge,
              course.is_public ? styles.badgePublic : styles.badgePrivate,
            ]}
          >
            <Text
              style={[
                styles.visibilityText,
                course.is_public ? styles.badgePublicText : styles.badgePrivateText,
              ]}
            >
              {course.is_public ? '공개' : '비공개'}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </View>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.detail}>
          <View style={styles.detailDivider} />

          <Text style={styles.detailDistance}>
            {formatDistance(course.distance_meters)}
          </Text>

          <View style={styles.detailStatsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(course.stats.total_runs)}
              </Text>
              <Text style={styles.statLabel}>도전</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(course.stats.unique_runners)}
              </Text>
              <Text style={styles.statLabel}>러너</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.secondary }]}>
                {course.stats.avg_pace_seconds_per_km
                  ? formatPace(course.stats.avg_pace_seconds_per_km)
                  : '--'}
              </Text>
              <Text style={styles.statLabel}>평균 페이스</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.detailBtn}
              onPress={() => onDetail(course.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="open-outline" size={14} color={colors.text} />
              <Text style={styles.detailBtnText}>상세 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => onEdit(course)}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={14} color={colors.primary} />
              <Text style={styles.editBtnText}>편집</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MyCoursesScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { myCourses, isLoadingMyCourses, fetchMyCourses, updateMyCourse } = useCourseStore();
  const nickname = useAuthStore((s) => s.user?.nickname ?? '나');

  // Edit modal state
  const [editCourse, setEditCourse] = useState<MyCourse | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchMyCourses();
  }, [fetchMyCourses]);

  const handleOpenEdit = useCallback((course: MyCourse) => {
    setEditCourse(course);
    setEditTitle(course.title);
    setEditDescription('');
    setEditPublic(course.is_public);
  }, []);

  const handleDetail = useCallback(
    (courseId: string) => {
      navigation.navigate('CourseDetail', { courseId });
    },
    [navigation],
  );

  const handleSave = async () => {
    if (!editCourse) return;
    if (editTitle.trim().length < 1) {
      Alert.alert('제목 확인', '코스 제목을 입력해 주세요.');
      return;
    }
    setIsSaving(true);
    try {
      await updateMyCourse(editCourse.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        is_public: editPublic,
      });
      setEditCourse(null);
    } catch {
      Alert.alert('저장 실패', '다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: MyCourse }) => (
      <MyCourseCard course={item} nickname={nickname} onEdit={handleOpenEdit} onDetail={handleDetail} />
    ),
    [nickname, handleOpenEdit, handleDetail],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 코스</Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoadingMyCourses ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : myCourses.length === 0 ? (
        <EmptyState
          icon="🏁"
          title="아직 만든 코스가 없습니다"
          description="런닝 후 나만의 코스를 등록해 보세요!"
        />
      ) : (
        <FlatList
          data={myCourses}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Edit Modal */}
      <Modal
        visible={editCourse !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditCourse(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditCourse(null)}>
                <Text style={styles.modalCancel}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>코스 편집</Text>
              <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                <Text style={[styles.modalSave, isSaving && { opacity: 0.4 }]}>
                  저장
                </Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>제목</Text>
              <TextInput
                style={styles.fieldInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="코스 이름"
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>설명</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="코스에 대한 간단한 설명"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{editDescription.length}/200</Text>
            </View>

            {/* Public toggle */}
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>공개</Text>
                <Text style={styles.toggleDescription}>
                  다른 러너가 이 코스에 도전할 수 있습니다
                </Text>
              </View>
              <Switch
                value={editPublic}
                onValueChange={setEditPublic}
                trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    },
    headerTitle: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },

    // Card
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      borderWidth: 1,
      borderColor: c.border,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryLeft: {
      flex: 1,
      marginRight: SPACING.md,
      gap: 4,
    },
    summaryRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    cardTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    cardMeta: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
    visibilityBadge: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
    },
    badgePublic: {
      backgroundColor: c.success + '18',
    },
    badgePrivate: {
      backgroundColor: c.textTertiary + '18',
    },
    visibilityText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
    },
    badgePublicText: {
      color: c.success,
    },
    badgePrivateText: {
      color: c.textTertiary,
    },

    // Expanded detail
    detail: {
      gap: SPACING.md,
    },
    detailDivider: {
      height: 1,
      backgroundColor: c.divider,
      marginTop: SPACING.lg,
    },
    detailDistance: {
      fontSize: 32,
      fontWeight: '900',
      color: c.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    detailStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    statDivider: {
      width: 1,
      height: 24,
      backgroundColor: c.divider,
    },
    statValue: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: SPACING.sm,
    },
    detailBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
    },
    detailBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
    },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.primary + '10',
    },
    editBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.primary,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING.xl,
    },
    modalCancel: {
      fontSize: FONT_SIZES.md,
      color: c.textSecondary,
      fontWeight: '500',
    },
    modalTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    modalSave: {
      fontSize: FONT_SIZES.md,
      color: c.primary,
      fontWeight: '700',
    },

    // Form fields
    fieldGroup: {
      marginBottom: SPACING.xl,
      gap: SPACING.sm,
    },
    fieldLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    fieldInput: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '500',
      color: c.text,
      borderBottomWidth: 2,
      borderBottomColor: c.border,
      paddingVertical: SPACING.md,
    },
    fieldTextArea: {
      minHeight: 80,
      textAlignVertical: 'top',
      borderBottomWidth: 0,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
    },
    charCount: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      alignSelf: 'flex-end',
      fontVariant: ['tabular-nums'],
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    toggleLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    toggleDescription: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      marginTop: 2,
    },
  });
