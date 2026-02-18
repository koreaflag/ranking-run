import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RunningStackParamList } from '../types/navigation';
import RunningScreen from '../screens/running/RunningScreen';
import RunResultScreen from '../screens/running/RunResultScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<RunningStackParamList>();

export default function RunningStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="RunningMain" component={RunningScreen} />
      <Stack.Screen name="RunResult" component={RunResultScreen} />
    </Stack.Navigator>
  );
}
