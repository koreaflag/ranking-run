import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
import { COUNTRIES, getCountryFlag, getCountryName } from '../../data/countries';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

interface CountryPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (code: string | null) => void;
  selectedCountry?: string | null;
}

export default function CountryPickerModal({
  visible,
  onClose,
  onSelect,
  selectedCountry,
}: CountryPickerModalProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Android: use useState for mount/unmount control instead of Modal
  const [androidMounted, setAndroidMounted] = useState(false);

  useEffect(() => {
    if (IS_ANDROID) {
      if (visible) {
        setAndroidMounted(true);
      } else {
        setAndroidMounted(false);
      }
    }
  }, [visible]);

  // Android: handle hardware back button
  useEffect(() => {
    if (!IS_ANDROID || !androidMounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [androidMounted, onClose]);

  const handleSelect = useCallback(
    (code: string | null) => {
      onSelect(code);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof COUNTRIES)[0] }) => {
      const isSelected = selectedCountry === item.code;
      return (
        <TouchableOpacity
          style={[styles.row, isSelected && styles.rowSelected]}
          onPress={() => handleSelect(item.code)}
          activeOpacity={0.6}
        >
          <Text style={styles.flag}>{getCountryFlag(item.code)}</Text>
          <Text style={[styles.name, isSelected && styles.nameSelected]}>
            {getCountryName(item.code)}
          </Text>
          {isSelected && (
            <Ionicons name="checkmark" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      );
    },
    [colors, handleSelect, selectedCountry, styles],
  );

  const content = (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.6}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('ranking.selectCountry')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* All countries option */}
      <TouchableOpacity
        style={[styles.row, !selectedCountry && styles.rowSelected]}
        onPress={() => handleSelect(null)}
        activeOpacity={0.6}
      >
        <Text style={styles.flag}>🌍</Text>
        <Text style={[styles.name, !selectedCountry && styles.nameSelected]}>
          {t('ranking.allCountries')}
        </Text>
        {!selectedCountry && (
          <Ionicons name="checkmark" size={18} color={colors.primary} />
        )}
      </TouchableOpacity>

      <View style={styles.divider} />

      <FlatList
        data={COUNTRIES}
        renderItem={renderItem}
        keyExtractor={(item) => item.code}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );

  // Android: render as absolute overlay to avoid Modal touch desync
  if (IS_ANDROID) {
    if (!androidMounted) return null;
    return (
      <View style={styles.androidOverlay}>
        <StatusBar backgroundColor={colors.background} barStyle="light-content" />
        {content}
      </View>
    );
  }

  // iOS: keep native Modal
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    androidOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: colors.background,
    } as any,
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: colors.text,
    },
    list: {
      paddingBottom: SPACING.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      gap: SPACING.sm,
    },
    rowSelected: {
      backgroundColor: colors.primary + '15',
    },
    flag: {
      fontSize: 22,
      width: 32,
      textAlign: 'center',
    },
    name: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: colors.text,
    },
    nameSelected: {
      fontWeight: '600',
      color: colors.primary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
  });
