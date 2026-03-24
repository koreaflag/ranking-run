import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import type { CrewActiveCourse } from '../../types/api';
import { crewService } from '../../services/crewService';
import { formatDistance, formatDuration } from '../../utils/format';

type Route = RouteProp<HomeStackParamList, 'CrewActiveCourses'>;

export default function CrewActiveCoursesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<Route>();
  const { crewId, crewName } = route.params;
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [courses, setCourses] = useState<CrewActiveCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      crewService.getActiveCourses(crewId)
        .then(setCourses)
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }, [crewId]),
  );

  const renderItem = useCallback(({ item }: { item: CrewActiveCourse }) => (
    <TouchableOpacity
      style={styles.courseRow}
      onPress={() => (navigation as any).navigate('CourseTab', { screen: 'CourseDetail', params: { courseId: item.course_id } })}
      activeOpacity={0.7}
    >
      <View style={styles.courseIcon}>
        <Ionicons name="map-outline" size={20} color={colors.primary} />
      </View>
      <View style={styles.courseInfo}>
        <Text style={styles.courseTitle} numberOfLines={1}>{item.course_title}</Text>
        <Text style={styles.courseMeta}>
          {formatDistance(item.distance_meters)} · {item.member_run_count}{t('crew.memberRuns')}
        </Text>
      </View>
      {item.best_crew_time_seconds != null && (
        <Text style={styles.courseBest}>{formatDuration(item.best_crew_time_seconds)}</Text>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  ), [styles, colors, navigation, t]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={`${crewName} · ${t('crew.activeCourses')}`} />
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : courses.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{t('crew.noActiveCourses')}</Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item.course_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: c.textTertiary,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },
  courseIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.primary + '14',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  courseInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
  },
  courseMeta: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
  },
  courseBest: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.primary,
    marginRight: SPACING.xs,
  },
});
