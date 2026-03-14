import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useToastStore } from '../../stores/toastStore';
import { useTheme } from '../../hooks/useTheme';

// Fixed top inset — ToastContainer renders outside SafeAreaProvider
const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 54 : 24;

type ToastType = 'error' | 'success' | 'info';

const ICONS: Record<ToastType, string> = {
  error: '\u2715',    // X mark
  success: '\u2713',  // check mark
  info: 'i',
};

interface ToastItemProps {
  id: string;
  type: ToastType;
  message: string;
}

function ToastItem({ id, type, message }: ToastItemProps) {
  const colors = useTheme();
  const removeToast = useToastStore((s) => s.removeToast);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const bgColors: Record<ToastType, string> = {
    error: colors.error,
    success: colors.success,
    info: colors.primary,
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      removeToast(id);
    });
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: bgColors[type],
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toastContent}
        onPress={handleDismiss}
        activeOpacity={0.8}
        accessibilityRole="alert"
        accessibilityLabel={message}
        accessibilityHint="탭하여 닫기"
      >
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{ICONS[type]}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: STATUS_BAR_HEIGHT + 8 }]}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
