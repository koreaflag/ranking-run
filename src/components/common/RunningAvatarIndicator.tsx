import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';

interface RunningAvatarIndicatorProps {
  avatarUrl: string | null;
  nickname: string;
  size: number;
  isRunning: boolean;
  borderWidth?: number;
}

const RUNNING_COLOR = '#34C759';
const DOT_SIZE = 8;

export default function RunningAvatarIndicator({
  avatarUrl,
  nickname,
  size,
  isRunning,
  borderWidth = 2.5,
}: RunningAvatarIndicatorProps) {
  const colors = useTheme();
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRunning) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1.15,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.6,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      animationRef.current = animation;
      animation.start();
    } else {
      animationRef.current?.stop();
      animationRef.current = null;
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.6);
    }

    return () => {
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [isRunning, pulseScale, pulseOpacity]);

  const styles = useMemo(
    () => createStyles(colors, size, borderWidth),
    [colors, size, borderWidth],
  );

  const pulseSize = size + borderWidth * 2 + 4;

  return (
    <View style={styles.container}>
      {isRunning && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: pulseSize,
              height: pulseSize,
              borderRadius: pulseSize / 2,
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
      )}

      <View style={[styles.avatarWrapper, isRunning && styles.runningBorder]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>
              {nickname.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {isRunning && (
        <View style={styles.dotOuter}>
          <View style={styles.dotInner} />
        </View>
      )}
    </View>
  );
}

function createStyles(
  colors: ThemeColors,
  size: number,
  borderWidth: number,
) {
  const outerSize = size + borderWidth * 2;

  return StyleSheet.create({
    container: {
      width: outerSize,
      height: outerSize,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pulseRing: {
      position: 'absolute',
      backgroundColor: RUNNING_COLOR,
    },
    avatarWrapper: {
      width: outerSize,
      height: outerSize,
      borderRadius: outerSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth,
      borderColor: 'transparent',
    },
    runningBorder: {
      borderColor: RUNNING_COLOR,
    },
    avatar: {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    fallback: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackText: {
      fontSize: size * 0.4,
      fontWeight: '600',
      color: colors.text,
    },
    dotOuter: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: DOT_SIZE + 4,
      height: DOT_SIZE + 4,
      borderRadius: (DOT_SIZE + 4) / 2,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotInner: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      backgroundColor: RUNNING_COLOR,
    },
  });
}
