import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import ScreenHeader from '../../components/common/ScreenHeader';
import BlurredBackground from '../../components/common/BlurredBackground';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

export default function ImportActivityScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader title={t('import.title')} onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-upload-outline" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.title}>{t('common.preparing')}</Text>
          <Text style={styles.description}>
            {t('import.comingSoon')}
          </Text>
        </View>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xxxl,
      gap: SPACING.lg,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONT_SIZES.title,
      fontWeight: '800',
      color: c.text,
    },
    description: {
      fontSize: FONT_SIZES.md,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
  });
