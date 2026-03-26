import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { LIGHT_THEME, DARK_THEME, type ThemeColors } from '../utils/constants';

export function useTheme(): ThemeColors {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const systemScheme = useColorScheme();

  const isDark = useMemo(() => {
    if (themeMode === 'auto') return systemScheme === 'dark';
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    // fallback for users who haven't migrated (themeMode is undefined)
    return darkMode;
  }, [themeMode, darkMode, systemScheme]);

  return useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);
}
