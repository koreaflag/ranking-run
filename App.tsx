import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import RootNavigator from './src/navigation/RootNavigator';
import { MAPBOX_ACCESS_TOKEN } from './src/config/env';

Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RootNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
