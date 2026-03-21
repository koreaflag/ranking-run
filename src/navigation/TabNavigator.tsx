import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { Ionicons } from '../lib/icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { MainTabParamList } from '../types/navigation';
import WorldStack from './WorldStack';
import HomeStack from './HomeStack';
import CourseStack from './CourseStack';
import CommunityStack from './CommunityStack';
import MyPageStack from './MyPageStack';
import { FONT_SIZES } from '../utils/constants';
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
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </View>
  );
}


export default function TabNavigator() {
  const colors = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

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
            shadowColor: colors.black,
            paddingBottom: Math.max(insets.bottom, 8),
            height: 60 + Math.max(insets.bottom, 8),
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
          tabBarAccessibilityLabel: t('tabs.home'),
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
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r: any) => r.key === route.key);
            if (tabRoute?.state && (tabRoute.state.index ?? 0) > 0) {
              e.preventDefault();
              navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: route.name }] }));
            }
          },
        })}
      />
      <Tab.Screen
        name="CourseTab"
        component={CourseStack}
        options={{
          tabBarAccessibilityLabel: t('tabs.course'),
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
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r: any) => r.key === route.key);
            if (tabRoute?.state && (tabRoute.state.index ?? 0) > 0) {
              e.preventDefault();
              navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: route.name }] }));
            }
          },
        })}
      />
      <Tab.Screen
        name="WorldTab"
        component={WorldStack}
        options={{
          tabBarAccessibilityLabel: t('tabs.world'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label={t('tabs.world')}
              iconName="globe-outline"
              iconNameFocused="globe"
              focused={focused}
              colors={colors}
            />
          ),
        }}
      />
      <Tab.Screen
        name="CommunityTab"
        component={CommunityStack}
        options={{
          tabBarAccessibilityLabel: t('tabs.social'),
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
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r: any) => r.key === route.key);
            if (tabRoute?.state && (tabRoute.state.index ?? 0) > 0) {
              e.preventDefault();
              navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: route.name }] }));
            }
          },
        })}
      />
      <Tab.Screen
        name="MyPageTab"
        component={MyPageStack}
        options={{
          tabBarAccessibilityLabel: t('tabs.my'),
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
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const tabRoute = state.routes.find((r: any) => r.key === route.key);
            if (tabRoute?.state && (tabRoute.state.index ?? 0) > 0) {
              e.preventDefault();
              navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: route.name }] }));
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 64,
  },
  tabLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

});
