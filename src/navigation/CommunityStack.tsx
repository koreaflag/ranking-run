import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CommunityStackParamList } from '../types/navigation';
import CommunityFeedScreen from '../screens/community/CommunityFeedScreen';
import CommunityPostDetailScreen from '../screens/community/CommunityPostDetailScreen';
import CommunityPostCreateScreen from '../screens/community/CommunityPostCreateScreen';
import CrewCreateScreen from '../screens/crew/CrewCreateScreen';
import CrewDetailScreen from '../screens/crew/CrewDetailScreen';
import CrewMembersScreen from '../screens/crew/CrewMembersScreen';
import CrewSearchScreen from '../screens/crew/CrewSearchScreen';
import CourseDetailScreen from '../screens/course/CourseDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import FindFriendsScreen from '../screens/mypage/FindFriendsScreen';
import CrewBoardScreen from '../screens/community/CrewBoardScreen';
import CrewEditScreen from '../screens/crew/CrewEditScreen';
import CrewManageScreen from '../screens/crew/CrewManageScreen';
import CrewNotificationsScreen from '../screens/crew/CrewNotificationsScreen';
import CommunityPostEditScreen from '../screens/community/CommunityPostEditScreen';
import FollowListScreen from '../screens/profile/FollowListScreen';
import FriendsScreen from '../screens/profile/FriendsScreen';
import UnifiedSearchScreen from '../screens/community/UnifiedSearchScreen';
import CrewMemberSettingsScreen from '../screens/crew/CrewMemberSettingsScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export default function CommunityStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="CommunityFeed" component={CommunityFeedScreen} />
      <Stack.Screen name="CommunityPostDetail" component={CommunityPostDetailScreen} />
      <Stack.Screen name="CommunityPostCreate" component={CommunityPostCreateScreen} />
      <Stack.Screen name="CrewCreate" component={CrewCreateScreen} />
      <Stack.Screen name="CrewDetail" component={CrewDetailScreen} />
      <Stack.Screen name="CrewMembers" component={CrewMembersScreen} />
      <Stack.Screen name="CrewSearch" component={CrewSearchScreen} />
      <Stack.Screen name="CourseDetail" component={CourseDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="FindFriends" component={FindFriendsScreen} />
      <Stack.Screen name="CrewBoard" component={CrewBoardScreen} />
      <Stack.Screen name="CrewEdit" component={CrewEditScreen} />
      <Stack.Screen name="CrewManage" component={CrewManageScreen} />
      <Stack.Screen name="CrewNotifications" component={CrewNotificationsScreen} />
      <Stack.Screen name="CommunityPostEdit" component={CommunityPostEditScreen} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
      <Stack.Screen name="UnifiedSearch" component={UnifiedSearchScreen} />
      <Stack.Screen name="CrewMemberSettings" component={CrewMemberSettingsScreen} />
    </Stack.Navigator>
  );
}
