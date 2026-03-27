import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useTheme } from '../../hooks/useTheme';
import { gearService } from '../../services/gearService';
import { formatDistance } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import type { GearItem } from '../../types/api';

const IS_ANDROID = Platform.OS === 'android';

const BRAND_NAMES = [
  'Nike',
  'Adidas',
  'New Balance',
  'Asics',
  'Hoka',
  'Brooks',
  'Saucony',
  'On',
  'Mizuno',
  'Puma',
  'Under Armour',
  'Reebok',
  'Salomon',
  'Altra',
];

export default function GearManageScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const BRANDS = useMemo(() => [...BRAND_NAMES, t('gear.other')], [t]);

  const [gearList, setGearList] = useState<GearItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [androidShowModal, setAndroidShowModal] = useState(false);
  const [editingGear, setEditingGear] = useState<GearItem | null>(null);

  // Add/Edit form state
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(true);

  const loadGear = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await gearService.getMyGear();
      setGearList(data);
    } catch {
      // Silent failure for initial load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGear();
  }, [loadGear]);

  const resetForm = useCallback(() => {
    setSelectedBrand(null);
    setModelName('');
    setShowBrandPicker(true);
    setEditingGear(null);
  }, []);

  const handleOpenAdd = useCallback(() => {
    resetForm();
    if (IS_ANDROID) setAndroidShowModal(true);
    setShowAddModal(true);
  }, [resetForm]);

  const handleOpenEdit = useCallback((gear: GearItem) => {
    setEditingGear(gear);
    setSelectedBrand(gear.brand);
    setModelName(gear.model_name);
    setShowBrandPicker(false);
    if (IS_ANDROID) setAndroidShowModal(true);
    setShowAddModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddModal(false);
    if (IS_ANDROID) setAndroidShowModal(false);
    resetForm();
  }, [resetForm]);

  // Android back button handler
  useEffect(() => {
    if (!IS_ANDROID || !showAddModal) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCloseModal();
      return true;
    });
    return () => sub.remove();
  }, [showAddModal, handleCloseModal]);

  const handleSave = useCallback(async () => {
    if (!selectedBrand || !modelName.trim()) {
      Alert.alert(t('gear.inputCheck'), t('gear.inputCheckMsg'));
      return;
    }

    setIsSaving(true);
    try {
      if (editingGear) {
        const updated = await gearService.updateGear(editingGear.id, {
          brand: selectedBrand,
          model_name: modelName.trim(),
        });
        setGearList((prev) =>
          prev.map((g) => (g.id === updated.id ? updated : g)),
        );
      } else {
        const created = await gearService.createGear({
          brand: selectedBrand,
          model_name: modelName.trim(),
          is_primary: gearList.length === 0,
        });
        setGearList((prev) => [...prev, created]);
      }
      handleCloseModal();
    } catch {
      Alert.alert(t('common.errorTitle'), t('gear.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedBrand, modelName, editingGear, gearList.length, handleCloseModal]);

  const handleDelete = useCallback(
    (gear: GearItem) => {
      Alert.alert(
        t('gear.deleteTitle'),
        t('gear.deleteMsg', { brand: gear.brand, model: gear.model_name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await gearService.deleteGear(gear.id);
                setGearList((prev) => prev.filter((g) => g.id !== gear.id));
              } catch {
                Alert.alert(t('common.errorTitle'), t('gear.deleteFailed'));
              }
            },
          },
        ],
      );
    },
    [],
  );

  const handleSetPrimary = useCallback(
    async (gear: GearItem) => {
      if (gear.is_primary) return;
      try {
        await gearService.updateGear(gear.id, { is_primary: true });
        setGearList((prev) =>
          prev.map((g) => ({
            ...g,
            is_primary: g.id === gear.id,
          })),
        );
      } catch {
        Alert.alert(t('common.errorTitle'), t('gear.setPrimaryFailed'));
      }
    },
    [],
  );

  const handleLongPress = useCallback(
    (gear: GearItem) => {
      const options = [
        { text: t('gear.edit'), onPress: () => handleOpenEdit(gear) },
        ...(!gear.is_primary
          ? [{ text: t('gear.setPrimary'), onPress: () => handleSetPrimary(gear) }]
          : []),
        {
          text: t('common.delete'),
          style: 'destructive' as const,
          onPress: () => handleDelete(gear),
        },
        { text: t('common.cancel'), style: 'cancel' as const },
      ];
      Alert.alert(
        `${gear.brand} ${gear.model_name}`,
        undefined,
        options,
      );
    },
    [handleOpenEdit, handleSetPrimary, handleDelete],
  );

  const renderGearItem = useCallback(
    ({ item }: { item: GearItem }) => (
      <TouchableOpacity
        style={styles.gearCard}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.gearIconCircle}>
          <Ionicons name="footsteps-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.gearInfo}>
          <View style={styles.gearNameRow}>
            <Text style={styles.gearBrand}>{item.brand}</Text>
            {item.is_primary && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>{t('gear.primary')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.gearModel} numberOfLines={1}>
            {item.model_name}
          </Text>
          <Text style={styles.gearDistance}>
            {formatDistance(item.total_distance_meters)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => handleLongPress(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [styles, colors, handleLongPress],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons name="footsteps-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>{t('gear.emptyTitle')}</Text>
        <Text style={styles.emptyDescription}>
          {t('gear.emptyDesc')}
        </Text>
      </View>
    ),
    [styles, colors],
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title={t('gear.title')}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={handleOpenAdd} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={gearList}
          keyExtractor={(item) => item.id}
          renderItem={renderGearItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={10}
        />
      )}

      {/* Add/Edit Gear Modal */}
      {(() => {
        const modalContent = (
          <SafeAreaView style={styles.modalContainer}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={handleCloseModal} activeOpacity={0.7}>
                  <Ionicons name="close" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {editingGear ? t('gear.editGear') : t('gear.addGear')}
                </Text>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={isSaving || !selectedBrand || !modelName.trim()}
                  activeOpacity={0.7}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.saveButton,
                        (!selectedBrand || !modelName.trim()) && styles.saveButtonDisabled,
                      ]}
                    >
                      {t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Brand Selection */}
                {showBrandPicker ? (
                  <View style={styles.brandSection}>
                    <Text style={styles.fieldLabel}>{t('gear.brandSelect')}</Text>
                    <View style={styles.brandGrid}>
                      {BRANDS.map((brand) => {
                        const isSelected = selectedBrand === brand;
                        return (
                          <TouchableOpacity
                            key={brand}
                            style={[
                              styles.brandChip,
                              isSelected && styles.brandChipSelected,
                            ]}
                            onPress={() => {
                              setSelectedBrand(brand);
                              setShowBrandPicker(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.brandChipText,
                                isSelected && styles.brandChipTextSelected,
                              ]}
                            >
                              {brand}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <>
                    {/* Selected brand display */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('gear.brand')}</Text>
                      <TouchableOpacity
                        style={styles.selectedBrandRow}
                        onPress={() => setShowBrandPicker(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.selectedBrandText}>{selectedBrand}</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={colors.textTertiary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Model name input */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{t('gear.modelName')}</Text>
                      <TextInput
                        style={styles.textInput}
                        value={modelName}
                        onChangeText={setModelName}
                        placeholder="예: Pegasus 41, Gel-Kayano 30"
                        placeholderTextColor={colors.textTertiary}
                        maxLength={50}
                        returnKeyType="done"
                        autoFocus
                      />
                    </View>
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        );

        if (IS_ANDROID) {
          if (!androidShowModal) return null;
          return (
            <View style={styles.androidModalRoot}>
              {modalContent}
            </View>
          );
        }

        return (
          <Modal
            visible={showAddModal}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleCloseModal}
          >
            {modalContent}
          </Modal>
        );
      })()}
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      padding: SPACING.xxl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
      flexGrow: 1,
    },

    // -- Gear Card --
    gearCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      gap: SPACING.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    gearIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gearInfo: {
      flex: 1,
      gap: 2,
    },
    gearNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    gearBrand: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    primaryBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    primaryBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: c.white,
      letterSpacing: 0.5,
    },
    gearModel: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    gearDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    moreButton: {
      padding: SPACING.xs,
    },

    // -- Empty State --
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: SPACING.xxxl * 2,
      gap: SPACING.md,
    },
    emptyTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    emptyDescription: {
      fontSize: FONT_SIZES.md,
      color: c.textTertiary,
      textAlign: 'center',
      lineHeight: 22,
    },

    // -- Android Modal Root --
    androidModalRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
    },

    // -- Modal --
    modalContainer: {
      flex: 1,
      backgroundColor: c.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },
    saveButton: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.primary,
    },
    saveButtonDisabled: {
      opacity: 0.35,
    },
    modalBody: {
      flex: 1,
    },
    modalContent: {
      padding: SPACING.xxl,
      gap: SPACING.xl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },

    // -- Brand Selection --
    brandSection: {
      gap: SPACING.lg,
    },
    fieldLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    brandGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    brandChip: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    brandChipSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    brandChipText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.text,
    },
    brandChipTextSelected: {
      color: c.white,
      fontWeight: '700',
    },

    // -- Form Fields --
    fieldGroup: {
      gap: SPACING.sm,
    },
    selectedBrandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1.5,
      borderBottomColor: c.border,
    },
    selectedBrandText: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    textInput: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.text,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1.5,
      borderBottomColor: c.border,
    },
  });
