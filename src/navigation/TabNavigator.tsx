import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../types/navigation';
import HomeStack from './HomeStack';
import CourseStack from './CourseStack';
import RunningStack from './RunningStack';
import MyPageStack from './MyPageStack';
import { COLORS, FONT_SIZES } from '../utils/constants';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabIconProps {
  label: string;
  emoji: string;
  focused: boolean;
}

function TabIcon({ label, emoji, focused }: TabIconProps) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? COLORS.primary : COLORS.textTertiary },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="홈" emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="CourseTab"
        component={CourseStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="코스탐색" emoji="🗺" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="RunningTab"
        component={RunningStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="런닝" emoji="🏃" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="MyPageTab"
        component={MyPageStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="마이페이지" emoji="👤" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabEmoji: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
});
