import React, { useEffect, useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import AuthStack from './AuthStack';
import TabNavigator from './TabNavigator';
import { useTheme } from '../hooks/useTheme';
import { ActivityIndicator, View, StatusBar } from 'react-native';
import { syncPendingData } from '../services/pendingSyncService';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading, isNewUser, loadStoredAuth } =
    useAuthStore();
  const colors = useTheme();

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  // Attempt to sync any pending offline data when app starts
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      syncPendingData().catch(() => {});
    }
  }, [isLoading, isAuthenticated]);

  const navTheme = useMemo(
    () => ({
      dark: colors.statusBar === 'light-content',
      colors: {
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '900' as const },
      },
    }),
    [colors],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showAuth = !isAuthenticated || isNewUser;

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar barStyle={colors.statusBar} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : (
          <Stack.Screen name="Main" component={TabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
