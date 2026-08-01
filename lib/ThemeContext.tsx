import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeName, ThemeMode, ThemeColors, THEMES, resolveColors } from './theme';
import { loadThemePref, saveThemePref } from './storage';

interface ThemeContextValue {
  colors: ThemeColors;
  themeName: ThemeName;
  mode: ThemeMode;
  isDark: boolean;
  setThemeName: (name: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: THEMES[0].dark,
  themeName: 'slate',
  mode: 'system',
  isDark: true,
  setThemeName: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeName, setThemeNameState] = useState<ThemeName>('slate');
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadThemePref().then((pref) => {
      if (pref) {
        setThemeNameState(pref.name);
        setModeState(pref.mode);
      }
      setLoaded(true);
    });
  }, []);

  const setThemeName = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    saveThemePref(name, mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    saveThemePref(themeName, m);
  }, [themeName]);

  const theme = THEMES.find((t) => t.name === themeName) ?? THEMES[0];
  const colors = resolveColors(theme, mode, systemScheme ?? null);
  const isDark = colors === theme.dark;

  return (
    <ThemeContext.Provider value={{ colors, themeName, mode, isDark, setThemeName, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
