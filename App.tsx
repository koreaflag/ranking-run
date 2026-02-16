import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';

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
