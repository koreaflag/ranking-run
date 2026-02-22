import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenHeader from '../../components/common/ScreenHeader';
import BlurredBackground from '../../components/common/BlurredBackground';
import { useTheme } from '../../hooks/useTheme';
import { FONT_SIZES, SPACING } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

const STRAVA_ORANGE = '#FC4C02';

export default function StravaConnectScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Strava 연동" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>STRAVA</Text>
          </View>
          <Text style={styles.title}>준비 중입니다</Text>
          <Text style={styles.description}>
            Strava 연동 기능을{'\n'}곧 제공할 예정입니다.
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
    logoBox: {
      width: 96,
      height: 96,
      borderRadius: 24,
      backgroundColor: STRAVA_ORANGE,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    logoText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 16,
      letterSpacing: 1.5,
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
