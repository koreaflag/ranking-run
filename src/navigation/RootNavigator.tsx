import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import AuthStack from './AuthStack';
import TabNavigator from './TabNavigator';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import { useTheme } from '../hooks/useTheme';
import { Alert, View, StatusBar } from 'react-native';
import ToastContainer from '../components/common/ToastContainer';
import {
  loadPersistedSession,
  clearPersistedSession,
} from '../services/runningSessionPersistence';
import { useRunningStore, type RunningPhase } from '../stores/runningStore';
import { runService } from '../services/runService';
import { formatDistance, formatDuration } from '../utils/format';
import { useNetworkStore } from '../stores/networkStore';
import OfflineBanner from '../components/common/OfflineBanner';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['runcrew://', 'app.runcrew://', 'https://runcrew.app'],
  config: {
    screens: {
      Main: {
        screens: {
          CourseTab: {
            screens: {
              CourseDetail: 'course/:courseId',
            },
          },
          CommunityTab: {
            screens: {
              UserProfile: 'profile/:userId',
              CrewDetail: 'crew/:crewId',
              CommunityPostDetail: 'post/:postId',
            },
          },
          MyPageTab: {
            screens: {
              RunDetail: 'run/:runId',
            },
          },
        },
      },
    },
  },
};

export default function RootNavigator() {
  const { isAuthenticated, isLoading, isNewUser, loadStoredAuth } =
    useAuthStore();
  const colors = useTheme();
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const navReadyRef = useRef(false);
  const recoveryCheckedRef = useRef(false);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  // Initialize network monitoring + auto-sync on network recovery
  useEffect(() => {
    const unsubscribe = useNetworkStore.getState().startListening();
    return unsubscribe;
  }, []);

  // Trigger sync when authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      useNetworkStore.getState().triggerSync();
    }
  }, [isLoading, isAuthenticated]);

  // --- Crash recovery: detect incomplete sessions on app start ---
  const checkCrashRecovery = useCallback(async () => {
    if (recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;

    const persisted = await loadPersistedSession();
    if (!persisted) return;
    if (persisted.phase !== 'running' && persisted.phase !== 'paused') {
      await clearPersistedSession();
      return;
    }

    // Sanity check: session must have some meaningful data
    if (persisted.distanceMeters < 10 && persisted.durationSeconds < 30) {
      await clearPersistedSession();
      return;
    }

    const distStr = formatDistance(persisted.distanceMeters);
    const durStr = formatDuration(persisted.durationSeconds);

    Alert.alert(
      '이전 러닝 복구',
      `비정상 종료된 러닝 기록이 있습니다.\n\n거리: ${distStr}\n시간: ${durStr}\n\n기록을 복구하시겠습니까?`,
      [
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            // Try server-side recovery if we have a real session ID
            if (persisted.sessionId && !persisted.sessionId.startsWith('local_')) {
              try {
                await runService.recoverSession(persisted.sessionId, {
                  finished_at: new Date().toISOString(),
                  total_chunks: persisted.chunkSequence,
                  uploaded_chunk_sequences: persisted.uploadedChunkSequences,
                });
              } catch {
                // Server recovery failed — data is lost
              }
            }
            await clearPersistedSession();
          },
        },
        {
          text: '복구하기',
          style: 'default',
          onPress: async () => {
            // Restore session data into the store, then mark as completed
            const { restoreSession, complete } = useRunningStore.getState();
            restoreSession({
              ...persisted,
              phase: persisted.phase as RunningPhase,
            });
            complete();

            await clearPersistedSession();

            // Navigate to RunResult after a short delay for navigation to settle
            setTimeout(() => {
              if (navRef.current) {
                try {
                  (navRef.current as any).navigate('Main', {
                    screen: 'World',
                    params: {
                      screen: 'RunResult',
                      params: {
                        sessionId: persisted.sessionId,
                        alreadyCompleted: false,
                      },
                    },
                  });
                } catch (e) {
                  console.warn('[CrashRecovery] Navigation failed:', e);
                }
              }
            }, 500);
          },
        },
      ],
      { cancelable: false },
    );
  }, [navRef]);

  // Run crash recovery after auth loads and navigation is ready
  useEffect(() => {
    if (!isLoading && isAuthenticated && navReadyRef.current) {
      checkCrashRecovery();
    }
  }, [isLoading, isAuthenticated, checkCrashRecovery]);

  const handleNavReady = useCallback(() => {
    navReadyRef.current = true;
    if (!isLoading && isAuthenticated) {
      checkCrashRecovery();
    }
  }, [isLoading, isAuthenticated, checkCrashRecovery]);

  const navTheme = useMemo(
    () => ({
      dark: colors.statusBar === 'light-content',
      colors: {
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '900' as const },
      },
    }),
    [colors],
  );

  if (isLoading) {
    return null;
  }

  const showAuth = !isAuthenticated && !isNewUser;
  const showOnboarding = isNewUser;

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <NavigationContainer theme={navTheme} ref={navRef} onReady={handleNavReady} linking={linking}>
        <StatusBar barStyle={colors.statusBar} />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {showOnboarding ? (
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          ) : showAuth ? (
            <Stack.Screen name="Auth" component={AuthStack} />
          ) : (
            <Stack.Screen name="Main" component={TabNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <ToastContainer />
    </View>
  );
}
