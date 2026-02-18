import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types/navigation';
import HomeScreen from '../screens/home/HomeScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}
