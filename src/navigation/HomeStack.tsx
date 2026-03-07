import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../types/navigation';
import HomeScreen from '../screens/home/HomeScreen';
import RunHistoryScreen from '../screens/mypage/RunHistoryScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import CrewCreateScreen from '../screens/crew/CrewCreateScreen';
import CrewDetailScreen from '../screens/crew/CrewDetailScreen';
import CrewMembersScreen from '../screens/crew/CrewMembersScreen';
import CrewSearchScreen from '../screens/crew/CrewSearchScreen';
import CommunityFeedScreen from '../screens/community/CommunityFeedScreen';
import CommunityPostDetailScreen from '../screens/community/CommunityPostDetailScreen';
import CommunityPostCreateScreen from '../screens/community/CommunityPostCreateScreen';
import CrewBoardScreen from '../screens/community/CrewBoardScreen';
import CrewEditScreen from '../screens/crew/CrewEditScreen';
import CrewManageScreen from '../screens/crew/CrewManageScreen';
import CrewNotificationsScreen from '../screens/crew/CrewNotificationsScreen';
import RunDetailScreen from '../screens/mypage/RunDetailScreen';
import CommunityPostEditScreen from '../screens/community/CommunityPostEditScreen';
import WorldScreen from '../screens/world/WorldScreen';
import CourseListScreen from '../screens/course/CourseListScreen';
import FollowListScreen from '../screens/profile/FollowListScreen';
import FriendsScreen from '../screens/profile/FriendsScreen';
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
      <Stack.Screen name="RunHistory" component={RunHistoryScreen} />
      <Stack.Screen name="RunDetail" component={RunDetailScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="CrewCreate" component={CrewCreateScreen} />
      <Stack.Screen name="CrewDetail" component={CrewDetailScreen} />
      <Stack.Screen name="CrewMembers" component={CrewMembersScreen} />
      <Stack.Screen name="CrewSearch" component={CrewSearchScreen} />
      <Stack.Screen name="CommunityFeed" component={CommunityFeedScreen} />
      <Stack.Screen name="CommunityPostDetail" component={CommunityPostDetailScreen} />
      <Stack.Screen name="CommunityPostCreate" component={CommunityPostCreateScreen} />
      <Stack.Screen name="CrewBoard" component={CrewBoardScreen} />
      <Stack.Screen name="CrewEdit" component={CrewEditScreen} />
      <Stack.Screen name="CrewManage" component={CrewManageScreen} />
      <Stack.Screen name="CrewNotifications" component={CrewNotificationsScreen} />
      <Stack.Screen name="CommunityPostEdit" component={CommunityPostEditScreen} />
      <Stack.Screen name="World" component={WorldScreen} />
      <Stack.Screen name="CourseList" component={CourseListScreen} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
    </Stack.Navigator>
  );
}
