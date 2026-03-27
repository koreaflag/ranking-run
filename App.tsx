import './src/i18n';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Mapbox from '@rnmapbox/maps';
import RootNavigator from './src/navigation/RootNavigator';
import { MAPBOX_ACCESS_TOKEN } from './src/config/env';
import { useSettingsStore } from './src/stores/settingsStore';
import { syncLanguageFromStore } from './src/i18n';

// Disable console in production to avoid JS thread blocking on Android
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
}

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

// Keep splash visible until app is ready
SplashScreen.preventAutoHideAsync();

function App() {
  const language = useSettingsStore((s) => s.language);
  useEffect(() => {
    syncLanguageFromStore(language);
  }, [language]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // ignore — splash may already be hidden
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

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

export default App;
