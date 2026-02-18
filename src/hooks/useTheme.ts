import { useMemo } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { LIGHT_THEME, DARK_THEME, type ThemeColors } from '../utils/constants';

export function useTheme(): ThemeColors {
  const darkMode = useSettingsStore((s) => s.darkMode);
  return useMemo(() => (darkMode ? DARK_THEME : LIGHT_THEME), [darkMode]);
}
