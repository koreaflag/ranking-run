import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

interface FeatureLockedOverlayProps {
  requiredLevel: number;
  crewLevel: number;
  children: React.ReactNode;
}

export default function FeatureLockedOverlay({
  requiredLevel,
  crewLevel,
  children,
}: FeatureLockedOverlayProps) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (crewLevel >= requiredLevel) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.dimmed}>
        {children}
      </View>
      <View style={styles.overlay}>
        <Ionicons name="lock-closed" size={22} color={colors.textTertiary} />
        <Text style={styles.lockText}>
          {t('crewLevel.lockedAt', { level: requiredLevel })}
        </Text>
        <Text style={styles.lockHint}>{t('crewLevel.unlockHint')}</Text>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'relative',
    },
    dimmed: {
      opacity: 0.35,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.background + 'CC',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: BORDER_RADIUS.md,
      gap: SPACING.xs,
    },
    lockText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    lockHint: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
  });
