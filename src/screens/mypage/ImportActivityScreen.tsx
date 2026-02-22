import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/common/ScreenHeader';
import BlurredBackground from '../../components/common/BlurredBackground';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

export default function ImportActivityScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="기록 가져오기" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-upload-outline" size={48} color={colors.textTertiary} />
          </View>
          <Text style={styles.title}>준비 중입니다</Text>
          <Text style={styles.description}>
            GPX / FIT 파일 가져오기 기능을{'\n'}곧 제공할 예정입니다.
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
