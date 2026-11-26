import { Appearance } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getItem, setItem } from './storage';

const THEME_KEY = 'bibliary.theme';

export type ColorScheme = 'light' | 'dark';

export function getSystemScheme(): ColorScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function subscribeToSystemScheme(
  listener: (scheme: ColorScheme) => void,
): () => void {
  const subscription = Appearance.addChangeListener(({ colorScheme }) => {
    listener(colorScheme === 'dark' ? 'dark' : 'light');
  });

  return () => subscription.remove();
}

export async function loadTheme(): Promise<ThemeMode> {
  const saved = await getItem(THEME_KEY);

  return saved === 'dark' || saved === 'light' || saved === 'auto'
    ? saved
    : 'light';
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  await setItem(THEME_KEY, mode);
}
