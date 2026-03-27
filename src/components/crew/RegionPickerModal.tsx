import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Platform,
  BackHandler,
  StatusBar,
} from 'react-native';

const IS_ANDROID = Platform.OS === 'android';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { KOREA_REGIONS, PROVINCE_LIST } from '../../data/koreaRegions';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

interface RegionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (region: string | null) => void;
  selectedRegion?: string | null;
  /** When true, only show province level (for search filter) */
  provinceOnly?: boolean;
}

export default function RegionPickerModal({
  visible,
  onClose,
  onSelect,
  selectedRegion,
  provinceOnly = false,
}: RegionPickerModalProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Parse selected region into province/district
  const [selectedProvince, selectedDistrict] = useMemo(() => {
    if (!selectedRegion) return [null, null];
    const parts = selectedRegion.split(' ');
    return [parts[0] || null, parts[1] || null];
  }, [selectedRegion]);

  const [step, setStep] = useState<'province' | 'district'>('province');
  const [pickedProvince, setPickedProvince] = useState<string | null>(selectedProvince);

  // Android: use absolute overlay instead of native Modal
  const [androidMounted, setAndroidMounted] = useState(false);

  useEffect(() => {
    if (IS_ANDROID) {
      if (visible) {
        setAndroidMounted(true);
        // Equivalent of onShow for Android overlay
        setStep('province');
        setPickedProvince(null);
      } else {
        setAndroidMounted(false);
      }
    }
  }, [visible]);

  // Android: handle hardware back button
  useEffect(() => {
    if (!IS_ANDROID || !androidMounted) return;
    const onBack = () => {
      if (step === 'district') {
        setStep('province');
        setPickedProvince(null);
      } else {
        onClose();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [androidMounted, step, onClose]);

  // Reset state when modal opens (iOS only — Android handled above)
  const handleShow = useCallback(() => {
    setStep('province');
    setPickedProvince(null);
  }, []);

  const handleSelectProvince = useCallback((province: string) => {
    const districts = KOREA_REGIONS[province] ?? [];
    if (provinceOnly || districts.length === 0) {
      onSelect(province);
      onClose();
    } else {
      setPickedProvince(province);
      setStep('district');
    }
  }, [provinceOnly, onSelect, onClose]);

  const handleSelectDistrict = useCallback((district: string) => {
    if (pickedProvince) {
      onSelect(`${pickedProvince} ${district}`);
      onClose();
    }
  }, [pickedProvince, onSelect, onClose]);

  const handleSelectProvinceOnly = useCallback(() => {
    if (pickedProvince) {
      onSelect(pickedProvince);
      onClose();
    }
  }, [pickedProvince, onSelect, onClose]);

  const handleClear = useCallback(() => {
    onSelect(null);
    onClose();
  }, [onSelect, onClose]);

  const handleBack = useCallback(() => {
    setStep('province');
    setPickedProvince(null);
  }, []);

  const districts = pickedProvince ? KOREA_REGIONS[pickedProvince] ?? [] : [];

  const renderProvince = useCallback(({ item }: { item: string }) => {
    const isSelected = item === selectedProvince;
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => handleSelectProvince(item)}
        activeOpacity={0.6}
      >
        <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>{item}</Text>
        <Ionicons name="chevron-forward" size={16} color={isSelected ? colors.primary : colors.textTertiary} />
      </TouchableOpacity>
    );
  }, [styles, colors, selectedProvince, handleSelectProvince]);

  const renderDistrict = useCallback(({ item }: { item: string }) => {
    const isSelected = item === selectedDistrict && pickedProvince === selectedProvince;
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => handleSelectDistrict(item)}
        activeOpacity={0.6}
      >
        <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>{item}</Text>
        {isSelected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
      </TouchableOpacity>
    );
  }, [styles, colors, selectedDistrict, selectedProvince, pickedProvince, handleSelectDistrict]);

  const modalContent = (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {step === 'district' ? (
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack} activeOpacity={0.6}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} activeOpacity={0.6}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>
          {step === 'province'
            ? t('crew.selectRegion')
            : pickedProvince ?? ''}
        </Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleClear} activeOpacity={0.6}>
          <Text style={styles.clearText}>{t('crew.resetRegion')}</Text>
        </TouchableOpacity>
      </View>

      {step === 'province' ? (
        <FlatList
          data={PROVINCE_LIST}
          keyExtractor={(item) => item}
          renderItem={renderProvince}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          {/* "Province only" option */}
          <TouchableOpacity
            style={[styles.row, styles.allRow]}
            onPress={handleSelectProvinceOnly}
            activeOpacity={0.6}
          >
            <Text style={[styles.rowText, { color: colors.primary, fontWeight: '700' }]}>
              {pickedProvince} {t('crew.allRegion')}
            </Text>
          </TouchableOpacity>
          <FlatList
            data={districts}
            keyExtractor={(item) => item}
            renderItem={renderDistrict}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );

  // Android: render as absolute overlay to avoid native Modal touch issues
  if (IS_ANDROID) {
    if (!androidMounted) return null;
    return (
      <View style={styles.androidOverlay}>
        <StatusBar backgroundColor={colors.background} barStyle="light-content" />
        {modalContent}
      </View>
    );
  }

  // iOS: use native Modal
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={handleShow}
    >
      {modalContent}
    </Modal>
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
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    headerBtn: {
      minWidth: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    clearText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: 40,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md + 2,
      paddingHorizontal: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    rowSelected: {
      backgroundColor: c.primary + '10',
      borderRadius: BORDER_RADIUS.sm,
    },
    rowText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
    },
    rowTextSelected: {
      fontWeight: '700',
      color: c.primary,
    },
    allRow: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.sm,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      borderBottomWidth: 0,
    },
    androidOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      elevation: 1000,
      backgroundColor: c.background,
    },
  });
