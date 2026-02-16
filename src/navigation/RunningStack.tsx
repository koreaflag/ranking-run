import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RunningStackParamList } from '../types/navigation';
import RunningScreen from '../screens/running/RunningScreen';
import RunResultScreen from '../screens/running/RunResultScreen';
import { COLORS } from '../utils/constants';

const Stack = createNativeStackNavigator<RunningStackParamList>();

export default function RunningStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="RunningMain" component={RunningScreen} />
      <Stack.Screen name="RunResult" component={RunResultScreen} />
    </Stack.Navigator>
  );
}
