import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorldStackParamList } from '../types/navigation';
import WorldScreen from '../screens/world/WorldScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import CrewDetailScreen from '../screens/crew/CrewDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import RunningScreen from '../screens/running/RunningScreen';
import RunResultScreen from '../screens/running/RunResultScreen';
import HeartRateSettingsScreen from '../screens/world/HeartRateSettingsScreen';
import WatchSettingsScreen from '../screens/world/WatchSettingsScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<WorldStackParamList>();

export default function WorldStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="World" component={WorldScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="CrewDetail" component={CrewDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="RunningMain" component={RunningScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="RunResult" component={RunResultScreen} />
      <Stack.Screen name="HeartRateSettings" component={HeartRateSettingsScreen} />
      <Stack.Screen name="WatchSettings" component={WatchSettingsScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
