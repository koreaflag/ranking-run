import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorldStackParamList } from '../types/navigation';
import WorldScreen from '../screens/world/WorldScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
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
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}
