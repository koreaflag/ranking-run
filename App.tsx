import './src/i18n';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import Mapbox from '@rnmapbox/maps';
import RootNavigator from './src/navigation/RootNavigator';
import { MAPBOX_ACCESS_TOKEN, SENTRY_DSN } from './src/config/env';
import { useSettingsStore } from './src/stores/settingsStore';
import { syncLanguageFromStore } from './src/i18n';

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
  });
}

function App() {
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    syncLanguageFromStore(language);
  }, [language]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <RootNavigator />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default SENTRY_DSN ? Sentry.wrap(App) : App;
