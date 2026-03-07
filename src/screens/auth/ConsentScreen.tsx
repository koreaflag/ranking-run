import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Ionicons } from '../../lib/icons';
import type { AuthStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { authService } from '../../services/authService';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ConsentItem {
  key: string;
  label: string;
  required: boolean;
  description?: string;
  navigateTo?: keyof AuthStackParamList;
  expandable?: boolean;
  expandedText?: string;
}

function getConsentItems(t: TFunction): ConsentItem[] {
  return [
    {
      key: 'terms',
      label: t('auth.consent.terms'),
      required: true,
      navigateTo: 'TermsDetail',
    },
    {
      key: 'privacy',
      label: t('auth.consent.privacy'),
      required: true,
      navigateTo: 'PrivacyDetail',
    },
    {
      key: 'location',
      label: t('auth.consent.location'),
      required: true,
      expandable: true,
      expandedText: t('auth.consent.locationDesc'),
    },
    {
      key: 'contacts',
      label: t('auth.consent.contacts'),
      required: false,
      description: t('auth.consent.contactsDesc'),
    },
    {
      key: 'marketing',
      label: t('auth.consent.marketing'),
      required: false,
      description: t('auth.consent.marketingDesc'),
    },
  ];
}

export default function ConsentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const consentItems = useMemo(() => getConsentItems(t), [t]);

  const [checked, setChecked] = useState<Record<string, boolean>>({
    terms: false,
    privacy: false,
    location: false,
    contacts: false,
    marketing: false,
  });
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allRequiredChecked = consentItems
    .filter((i) => i.required)
    .every((i) => checked[i.key]);

  const allChecked = consentItems.every((i) => checked[i.key]);

  const toggleAll = useCallback(() => {
    const newValue = !allChecked;
    const next: Record<string, boolean> = {};
    for (const item of consentItems) {
      next[item.key] = newValue;
    }
    setChecked(next);
  }, [allChecked, consentItems]);

  const toggleItem = useCallback((key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const handleSubmit = async () => {
    if (!allRequiredChecked) return;

    setIsSubmitting(true);
    try {
      await authService.submitConsent({
        terms: checked.terms,
        privacy: checked.privacy,
        location: checked.location,
        contacts: checked.contacts,
        marketing: checked.marketing,
      });
      navigation.replace('Onboarding');
    } catch {
      Alert.alert(t('common.errorTitle'), t('auth.consent.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNavigateDetail = (screen: keyof AuthStackParamList) => {
    navigation.navigate(screen);
  };

  const renderCheckbox = (isChecked: boolean, size: number = 22) => (
    <View
      style={[
        styles.checkbox,
        { width: size, height: size, borderRadius: size / 2 },
        isChecked && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      {isChecked && (
        <Ionicons name="checkmark" size={size - 6} color="#FFF" />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.consent.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
            {t('auth.consent.subtitle')}
          </Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* All agree */}
          <TouchableOpacity
            style={[styles.allAgreeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={toggleAll}
            activeOpacity={0.7}
          >
            {renderCheckbox(allChecked, 26)}
            <View style={styles.allAgreeText}>
              <Text style={[styles.allAgreeLabel, { color: colors.text }]}>{t('auth.consent.agreeAll')}</Text>
              <Text style={[styles.allAgreeDesc, { color: colors.textTertiary }]}>
                {t('auth.consent.agreeAllDesc')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Individual items */}
          <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {consentItems.map((item, index) => {
              const isExpanded = expandedKey === item.key;
              const isLast = index === consentItems.length - 1;

              return (
                <View key={item.key}>
                  <View style={styles.itemRow}>
                    <TouchableOpacity
                      style={styles.itemLeft}
                      onPress={() => toggleItem(item.key)}
                      activeOpacity={0.7}
                    >
                      {renderCheckbox(checked[item.key])}
                      <Text style={[styles.itemLabel, { color: colors.text }]}>
                        <Text style={[styles.badge, { color: item.required ? colors.primary : colors.textTertiary }]}>
                          {item.required ? t('auth.consent.required') : t('auth.consent.optional')}
                        </Text>
                        {item.label}
                      </Text>
                    </TouchableOpacity>

                    {item.navigateTo && (
                      <TouchableOpacity
                        onPress={() => handleNavigateDetail(item.navigateTo!)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}

                    {item.expandable && (
                      <TouchableOpacity
                        onPress={() => toggleExpand(item.key)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textTertiary}
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Description for optional items */}
                  {item.description && (
                    <Text style={[styles.itemDescription, { color: colors.textTertiary }]}>
                      {item.description}
                    </Text>
                  )}

                  {/* Expandable content */}
                  {item.expandable && isExpanded && item.expandedText && (
                    <View style={[styles.expandedBox, { backgroundColor: colors.surfaceLight }]}>
                      <Text style={[styles.expandedText, { color: colors.textSecondary }]}>
                        {item.expandedText}
                      </Text>
                    </View>
                  )}

                  {!isLast && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* CTA */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.ctaButton,
              { backgroundColor: colors.primary },
              (!allRequiredChecked || isSubmitting) && styles.ctaButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!allRequiredChecked || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.ctaText}>{t('auth.consent.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: SPACING.xxl,
    },

    // Header
    header: {
      paddingTop: SPACING.xxxl,
      paddingBottom: SPACING.lg,
      gap: SPACING.sm,
    },
    title: {
      fontSize: FONT_SIZES.title,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '400',
      lineHeight: 22,
    },

    // Scroll
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      gap: SPACING.md,
      paddingBottom: SPACING.lg,
    },

    // All agree card
    allAgreeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.xl,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      gap: SPACING.lg,
    },
    allAgreeText: {
      flex: 1,
      gap: 2,
    },
    allAgreeLabel: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
    },
    allAgreeDesc: {
      fontSize: FONT_SIZES.sm,
    },

    // Items card
    itemsCard: {
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      paddingVertical: SPACING.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md + 2,
      paddingHorizontal: SPACING.xl,
    },
    itemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: SPACING.md,
    },
    itemLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      flex: 1,
    },
    badge: {
      fontWeight: '700',
      fontSize: FONT_SIZES.sm,
    },
    itemDescription: {
      fontSize: FONT_SIZES.xs,
      lineHeight: 18,
      paddingHorizontal: SPACING.xl,
      paddingLeft: SPACING.xl + 22 + SPACING.md,
      paddingBottom: SPACING.sm,
    },

    // Checkbox
    checkbox: {
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Expandable
    expandedBox: {
      marginHorizontal: SPACING.xl,
      marginBottom: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
    },
    expandedText: {
      fontSize: FONT_SIZES.xs,
      lineHeight: 20,
    },

    // Divider
    divider: {
      height: 1,
      marginLeft: SPACING.xl + 22 + SPACING.md,
      marginRight: SPACING.xl,
    },

    // CTA
    buttonSection: {
      paddingVertical: SPACING.xl,
    },
    ctaButton: {
      width: '100%',
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.lg + 2,
      ...SHADOWS.md,
    },
    ctaButtonDisabled: {
      opacity: 0.35,
    },
    ctaText: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
  });
