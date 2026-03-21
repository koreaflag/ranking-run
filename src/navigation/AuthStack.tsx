import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types/navigation';
import LoginScreen from '../screens/auth/LoginScreen';
import ConsentScreen from '../screens/auth/ConsentScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import TermsOfServiceScreen from '../screens/mypage/TermsOfServiceScreen';
import PrivacyPolicyScreen from '../screens/mypage/PrivacyPolicyScreen';
import LocationConsentScreen from '../screens/auth/LocationConsentScreen';
import { useTheme } from '../hooks/useTheme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  const colors = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Consent" component={ConsentScreen} />
      <Stack.Screen name="TermsDetail" component={TermsOfServiceScreen} />
      <Stack.Screen name="PrivacyDetail" component={PrivacyPolicyScreen} />
      <Stack.Screen name="LocationDetail" component={LocationConsentScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}
