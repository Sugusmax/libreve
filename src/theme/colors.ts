export const lightColors = {
  background: '#F7F4EF',
  surface: '#FFFFFF',
  primary: '#5B4B8A',
  primaryDark: '#382F55',
  accent: '#D8A862',
  text: '#292532',
  muted: '#706A7B',
  border: '#E4DED4',
  hint: '#F1E8DA',
} as const;

export const darkColors = {
  background: '#141219',
  surface: '#211E2B',
  primary: '#A88BE0',
  primaryDark: '#E5DBF5',
  accent: '#E2BC7B',
  text: '#F5F2FA',
  muted: '#ADA6BC',
  border: '#3A3546',
  hint: '#2C2836',
} as const;

export type Palette = { [Key in keyof typeof lightColors]: string };
export type ThemeMode = 'light' | 'dark' | 'auto';

/** Paleta histórica: se mantiene para las pantallas que aún no usan el tema. */
export const colors = lightColors;

export function resolveColors(
  scheme: 'light' | 'dark' | null | undefined,
): Palette {
  return scheme === 'dark' ? darkColors : lightColors;
}
