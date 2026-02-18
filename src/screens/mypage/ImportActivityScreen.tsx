import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { importService } from '../../services/importService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { ImportDetailResponse } from '../../types/api';
import { formatDistance, formatDuration, formatPace } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

export default function ImportActivityScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [imports, setImports] = useState<ImportDetailResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);

  const loadImports = useCallback(async () => {
    try {
      const result = await importService.listImports();
      setImports(result.data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  // Poll for processing imports
  useEffect(() => {
    if (!pollingId) return;

    const interval = setInterval(async () => {
      try {
        const status = await importService.getImportStatus(pollingId);
        if (status.status === 'completed' || status.status === 'failed') {
          setPollingId(null);
          loadImports();
          if (status.status === 'completed') {
            const dist = status.import_summary?.distance_meters ?? 0;
            const courseMatch = status.course_match
              ? `\n코스 매칭: ${status.course_match.course_title} (${status.course_match.match_percent}%)`
              : '';
            Alert.alert(
              'Import 완료',
              `${formatDistance(dist)} 러닝 기록이 추가되었습니다.${courseMatch}`,
            );
          } else {
            Alert.alert('앗...!', status.error_message || '파일 처리 중 오류가 발생했습니다.');
          }
        }
      } catch {
        // polling failure, keep trying
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pollingId, loadImports]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const ext = file.name.toLowerCase();

      if (!ext.endsWith('.gpx') && !ext.endsWith('.fit')) {
        Alert.alert('지원하지 않는 형식', 'GPX 또는 FIT 파일만 업로드할 수 있습니다.');
        return;
      }

      setIsUploading(true);

      try {
        const response = await importService.uploadFile(file.uri, file.name);
        setPollingId(response.import_id);
        loadImports();
      } catch {
        Alert.alert('앗...!', '파일 업로드 중 오류가 발생했습니다.');
      } finally {
        setIsUploading(false);
      }
    } catch {
      // picker cancelled or error
    }
  };

  const handleDelete = (importItem: ImportDetailResponse) => {
    Alert.alert(
      '기록 삭제',
      '이 import와 연관된 러닝 기록도 함께 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await importService.deleteImport(importItem.id);
              loadImports();
            } catch {
              Alert.alert('앗...!', '삭제에 실패했습니다.');
            }
          },
        },
      ],
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadImports();
    setRefreshing(false);
  }, [loadImports]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'failed': return colors.error;
      case 'processing': return colors.warning;
      default: return colors.textTertiary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '완료';
      case 'failed': return '실패';
      case 'processing': return '처리 중';
      case 'pending': return '대기 중';
      default: return status;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'gpx_upload': return 'GPX';
      case 'fit_upload': return 'FIT';
      case 'strava': return 'Strava';
      default: return source;
    }
  };

  const renderImportItem = ({ item }: { item: ImportDetailResponse }) => (
    <View style={styles.importCard}>
      <View style={styles.importHeader}>
        <View style={styles.importHeaderLeft}>
          <View style={[styles.sourceChip, { backgroundColor: colors.surfaceLight }]}>
            <Text style={styles.sourceChipText}>{getSourceLabel(item.source)}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
        {item.status === 'completed' && (
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {item.original_filename && (
        <Text style={styles.filename} numberOfLines={1}>
          {item.original_filename}
        </Text>
      )}

      {item.import_summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatDistance(item.import_summary.distance_meters)}
            </Text>
            <Text style={styles.summaryLabel}>거리</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatDuration(item.import_summary.duration_seconds)}
            </Text>
            <Text style={styles.summaryLabel}>시간</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {formatPace(item.import_summary.avg_pace_seconds_per_km)}
            </Text>
            <Text style={styles.summaryLabel}>페이스</Text>
          </View>
        </View>
      )}

      {item.course_match && (
        <View style={styles.courseMatchBanner}>
          <Ionicons name="trophy-outline" size={16} color={colors.accent} />
          <Text style={styles.courseMatchText}>
            {item.course_match.course_title} ({item.course_match.match_percent}% 매칭)
          </Text>
        </View>
      )}

      {item.status === 'processing' && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={colors.warning} />
          <Text style={styles.processingText}>파일 처리 중...</Text>
        </View>
      )}

      {item.error_message && (
        <Text style={styles.errorText} numberOfLines={2}>{item.error_message}</Text>
      )}

      {item.import_summary?.source_device && (
        <Text style={styles.deviceText}>
          {item.import_summary.source_device}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>기록 가져오기</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Upload Area */}
      <TouchableOpacity
        style={styles.uploadArea}
        onPress={handlePickFile}
        disabled={isUploading}
        activeOpacity={0.7}
      >
        {isUploading ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.uploadText}>업로드 중...</Text>
          </>
        ) : (
          <>
            <View style={styles.uploadIconCircle}>
              <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.uploadTitle}>GPX / FIT 파일 업로드</Text>
            <Text style={styles.uploadDescription}>
              Garmin, Suunto, Polar, COROS 등{'\n'}워치에서 내보낸 파일을 선택하세요
            </Text>
            <View style={styles.uploadFormats}>
              <View style={styles.formatChip}>
                <Text style={styles.formatChipText}>.gpx</Text>
              </View>
              <View style={styles.formatChip}>
                <Text style={styles.formatChipText}>.fit</Text>
              </View>
            </View>
          </>
        )}
      </TouchableOpacity>

      {/* Import History */}
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Import 이력</Text>
        <Text style={styles.historyCount}>{imports.length}건</Text>
      </View>

      <FlatList
        data={imports}
        keyExtractor={(item) => item.id}
        renderItem={renderImportItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>아직 가져온 기록이 없습니다</Text>
          </View>
        }
      />
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
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },

    // Upload Area
    uploadArea: {
      marginHorizontal: SPACING.xl,
      marginTop: SPACING.md,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 2,
      borderColor: c.border,
      borderStyle: 'dashed',
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.md,
    },
    uploadIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    uploadText: {
      fontSize: FONT_SIZES.md,
      color: c.textSecondary,
      fontWeight: '600',
      marginTop: SPACING.md,
    },
    uploadDescription: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },
    uploadFormats: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    formatChip: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xs,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surfaceLight,
    },
    formatChipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },

    // History
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      marginTop: SPACING.xxl,
      marginBottom: SPACING.md,
    },
    historyTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    historyCount: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },

    // Import Card
    importCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    importHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    importHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    sourceChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
    },
    sourceChipText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textSecondary,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
    },
    filename: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
    },

    // Summary
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceLight,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    summaryValue: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    summaryLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    summaryDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.divider,
    },

    // Course Match
    courseMatchBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: c.surfaceLight,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.sm,
    },
    courseMatchText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.accent,
    },

    // Processing
    processingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    processingText: {
      fontSize: FONT_SIZES.sm,
      color: c.warning,
      fontWeight: '600',
    },

    // Error
    errorText: {
      fontSize: FONT_SIZES.xs,
      color: c.error,
    },

    // Device
    deviceText: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
    },

    // Empty
    emptyState: {
      alignItems: 'center',
      paddingVertical: SPACING.xxxl,
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      fontWeight: '500',
    },
  });
