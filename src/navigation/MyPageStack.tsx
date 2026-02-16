import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MyPageStackParamList } from '../types/navigation';
import MyPageScreen from '../screens/mypage/MyPageScreen';
import { COLORS } from '../utils/constants';

const Stack = createNativeStackNavigator<MyPageStackParamList>();

export default function MyPageStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MyPage" component={MyPageScreen} />
    </Stack.Navigator>
  );
}
