import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CourseStackParamList } from '../types/navigation';
import CourseListScreen from '../screens/course/CourseListScreen';
import CourseSearchScreen from '../screens/course/CourseSearchScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import CourseCreateScreen from '../screens/course/CourseCreateScreen';
import CourseRouteCorrectScreen from '../screens/course/CourseRouteCorrectScreen';
import CrewDetailScreen from '../screens/crew/CrewDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<CourseStackParamList>();

export default function CourseStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="CourseList" component={CourseListScreen} />
      <Stack.Screen name="CourseSearch" component={CourseSearchScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="CourseCreate" component={CourseCreateScreen} />
      <Stack.Screen name="CourseRouteCorrect" component={CourseRouteCorrectScreen} />
      <Stack.Screen name="CrewDetail" component={CrewDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}
