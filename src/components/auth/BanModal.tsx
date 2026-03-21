import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

interface BanModalProps {
  visible: boolean;
  reason: string;
  onClose: () => void;
}

export default function BanModal({ visible, reason, onClose }: BanModalProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { submitBanAppeal, logout } = useAuthStore();

  const [appealText, setAppealText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const handleSubmitAppeal = async () => {
    if (!appealText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(false);

    const success = await submitBanAppeal(appealText.trim());
    setIsSubmitting(false);

    if (success) {
      setSubmitted(true);
    } else {
      setSubmitError(true);
    }
  };

  const handleClose = async () => {
    await logout();
    setAppealText('');
    setSubmitted(false);
    setSubmitError(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modal}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="close-circle-outline" size={48} color={colors.error} />
            </View>

            {/* Title */}
            <Text style={styles.title}>{t('auth.ban.title')}</Text>
            <Text style={styles.message}>{t('auth.ban.message')}</Text>

            {/* Reason */}
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>{t('auth.ban.reason')}</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>

            {/* Appeal Section */}
            {!submitted ? (
              <View style={styles.appealSection}>
                <Text style={styles.appealTitle}>{t('auth.ban.appealTitle')}</Text>
                <TextInput
                  style={styles.appealInput}
                  placeholder={t('auth.ban.appealPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  value={appealText}
                  onChangeText={setAppealText}
                  multiline
                  maxLength={2000}
                  textAlignVertical="top"
                />
                {submitError && (
                  <Text style={styles.errorText}>{t('auth.ban.appealFailed')}</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.appealButton,
                    (!appealText.trim() || isSubmitting) && styles.appealButtonDisabled,
                  ]}
                  onPress={handleSubmitAppeal}
                  disabled={!appealText.trim() || isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.appealButtonText}>
                      {t('auth.ban.appealSubmit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={styles.successText}>{t('auth.ban.appealSuccess')}</Text>
              </View>
            )}

            {/* Close */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>{t('auth.ban.close')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    modal: {
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl,
      alignItems: 'center',
    },
    iconContainer: {
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      marginBottom: SPACING.xs,
    },
    message: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.lg,
      lineHeight: 20,
    },
    reasonBox: {
      width: '100%',
      backgroundColor: c.background,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    reasonLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.textTertiary,
      marginBottom: SPACING.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    reasonText: {
      fontSize: FONT_SIZES.md,
      color: c.text,
      lineHeight: 22,
    },
    appealSection: {
      width: '100%',
      marginBottom: SPACING.md,
    },
    appealTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      marginBottom: SPACING.sm,
    },
    appealInput: {
      width: '100%',
      height: 120,
      backgroundColor: c.background,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      fontSize: FONT_SIZES.sm,
      color: c.text,
      marginBottom: SPACING.sm,
    },
    errorText: {
      fontSize: FONT_SIZES.xs,
      color: c.error,
      marginBottom: SPACING.sm,
    },
    appealButton: {
      width: '100%',
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.full,
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    appealButtonDisabled: {
      opacity: 0.5,
    },
    appealButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFF',
    },
    successBox: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.background,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    successText: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      color: c.text,
      lineHeight: 20,
    },
    closeButton: {
      width: '100%',
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
    },
  });
