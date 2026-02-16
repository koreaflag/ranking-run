import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CourseStackParamList } from '../types/navigation';
import CourseListScreen from '../screens/course/CourseListScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import { COLORS } from '../utils/constants';

const Stack = createNativeStackNavigator<CourseStackParamList>();

export default function CourseStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="CourseList" component={CourseListScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
    </Stack.Navigator>
  );
}
