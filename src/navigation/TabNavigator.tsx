import React from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '../lib/icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { MainTabParamList } from '../types/navigation';
import WorldStack from './WorldStack';
import HomeStack from './HomeStack';
import CourseStack from './CourseStack';
import CommunityStack from './CommunityStack';
import MyPageStack from './MyPageStack';
import { COLORS, FONT_SIZES } from '../utils/constants';
import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../stores/settingsStore';
import { useWatchStartListener } from '../hooks/useWatchStartListener';
import { useWatchRunSync } from '../hooks/useWatchRunSync';
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
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function WorldTabIcon({ focused, colors, label }: { focused: boolean; colors: ThemeColors; label: string }) {
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
        {label}
      </Text>
    </View>
  );
}

export default function TabNavigator() {
  const colors = useTheme();
  const { t } = useTranslation();

  // Global: listen for Watch-initiated run start and navigate to WorldTab
  useWatchStartListener();
  // Global: listen for standalone Watch run completion and sync to server
  useWatchRunSync();

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
              label={t('tabs.home')}
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
              label={t('tabs.course')}
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
          tabBarIcon: ({ focused }) => <WorldTabIcon focused={focused} colors={colors} label={t('tabs.world')} />,
        }}
      />
      <Tab.Screen
        name="CommunityTab"
        component={CommunityStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label={t('tabs.social')}
              iconName="chatbubbles-outline"
              iconNameFocused="chatbubbles"
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
              label={t('tabs.my')}
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
