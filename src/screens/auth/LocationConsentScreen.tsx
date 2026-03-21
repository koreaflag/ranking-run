import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { getLegalHtml } from '../../utils/legalHtml';

export default function LocationConsentScreen() {
  const navigation = useNavigation();
  const { i18n, t } = useTranslation();
  const colors = useTheme();
  const darkMode = useSettingsStore((s) => s.darkMode);

  const html = useMemo(
    () => getLegalHtml('locationConsent', i18n.language, darkMode),
    [i18n.language, darkMode],
  );

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title={t('auth.consent.location')}
          onBack={() => navigation.goBack()}
        />
        <WebView
          source={{ html }}
          style={[styles.webview, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
          originWhitelist={['*']}
          scrollEnabled
        />
      </SafeAreaView>
    </BlurredBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
