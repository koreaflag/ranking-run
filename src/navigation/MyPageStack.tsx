import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MyPageStackParamList } from '../types/navigation';
import MyPageScreen from '../screens/mypage/MyPageScreen';
import ProfileEditScreen from '../screens/mypage/ProfileEditScreen';
import MyCoursesScreen from '../screens/mypage/MyCoursesScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import ImportActivityScreen from '../screens/mypage/ImportActivityScreen';
import StravaConnectScreen from '../screens/mypage/StravaConnectScreen';
import GearManageScreen from '../screens/mypage/GearManageScreen';
import SettingsScreen from '../screens/mypage/SettingsScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<MyPageStackParamList>();

export default function MyPageStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MyPage" component={MyPageScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <Stack.Screen name="MyCourses" component={MyCoursesScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="ImportActivity" component={ImportActivityScreen} />
      <Stack.Screen name="StravaConnect" component={StravaConnectScreen} />
      <Stack.Screen name="GearManage" component={GearManageScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
