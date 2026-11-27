import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  getSystemScheme,
  loadTheme,
  saveTheme,
  subscribeToSystemScheme,
  type ColorScheme,
} from '../services/theme';
import { resolveColors, type Palette, type ThemeMode } from './colors';

type ThemeContextValue = {
  colors: Palette;
  scheme: ColorScheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setMode] = useState<ThemeMode>('light');
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemScheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void loadTheme()
      .then((mode) => {
        if (active) {
          setMode(mode);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    const unsubscribe = subscribeToSystemScheme(setSystemScheme);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const scheme: ColorScheme = themeMode === 'auto' ? systemScheme : themeMode;
  const colors = useMemo(() => resolveColors(scheme), [scheme]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.style.setProperty('--libreve-bg', colors.background);

    return () => {
      document.documentElement.style.removeProperty('--libreve-bg');
    };
  }, [colors.background]);

  const setThemeMode = (mode: ThemeMode) => {
    setMode(mode);
    void saveTheme(mode);
  };

  const value = useMemo(
    () => ({ colors, scheme, themeMode, setThemeMode, ready }),
    [colors, scheme, themeMode, ready],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useAppTheme debe usarse dentro de ThemeProvider');
  }

  return value;
}
