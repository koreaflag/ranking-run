import React from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { MainTabParamList } from '../types/navigation';
import WorldStack from './WorldStack';
import HomeStack from './HomeStack';
import CourseStack from './CourseStack';
import RunningStack from './RunningStack';
import MyPageStack from './MyPageStack';
import { COLORS, FONT_SIZES } from '../utils/constants';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../stores/settingsStore';
import type { ThemeColors } from '../utils/constants';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabIconProps {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconNameFocused: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  colors: ThemeColors;
}

function TabIcon({ label, iconName, iconNameFocused, focused, colors }: TabIconProps) {
  const active = colors.text;
  const inactive = colors.textTertiary;
  return (
    <View style={styles.tabIconContainer}>
      <Ionicons
        name={focused ? iconNameFocused : iconName}
        size={24}
        color={focused ? active : inactive}
      />
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? active : inactive },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function WorldTabIcon({ focused, colors }: { focused: boolean; colors: ThemeColors }) {
  return (
    <View style={styles.worldTabWrapper}>
      <View
        style={[
          styles.worldTabCircle,
          focused
            ? [styles.worldTabCircleActive, { backgroundColor: colors.primary }]
            : { backgroundColor: colors.surface },
        ]}
      >
        <Ionicons
          name={focused ? 'globe' : 'globe-outline'}
          size={26}
          color={focused ? COLORS.white : colors.textTertiary}
        />
      </View>
      <Text
        style={[
          styles.worldTabLabel,
          { color: focused ? colors.text : colors.textTertiary },
        ]}
      >
        월드
      </Text>
    </View>
  );
}

export default function TabNavigator() {
  const colors = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="WorldTab"
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.divider,
          },
        ],
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
      screenListeners={{
        tabPress: () => {
          if (useSettingsStore.getState().hapticFeedback) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="홈"
              iconName="home-outline"
              iconNameFocused="home"
              focused={focused}
              colors={colors}
            />
          ),
        }}
      />
      <Tab.Screen
        name="CourseTab"
        component={CourseStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="코스"
              iconName="map-outline"
              iconNameFocused="map"
              focused={focused}
              colors={colors}
            />
          ),
        }}
      />
      <Tab.Screen
        name="WorldTab"
        component={WorldStack}
        options={{
          tabBarIcon: ({ focused }) => <WorldTabIcon focused={focused} colors={colors} />,
        }}
      />
      <Tab.Screen
        name="RunningTab"
        component={RunningStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="러닝"
              iconName="footsteps-outline"
              iconNameFocused="footsteps"
              focused={focused}
              colors={colors}
            />
          ),
        }}
      />
      <Tab.Screen
        name="MyPageTab"
        component={MyPageStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="마이"
              iconName="person-outline"
              iconNameFocused="person"
              focused={focused}
              colors={colors}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#F0F0F0',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 84,
    paddingBottom: 24,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // World tab — raised highlighted circle
  worldTabWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
  },
  worldTabCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  worldTabCircleActive: {
    backgroundColor: COLORS.primary,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  worldTabCircleInactive: {
    backgroundColor: '#F0F0F0',
  },
  worldTabLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
