import { Platform } from 'react-native';
import { getItem, setItem } from './storage';

const SETTINGS_KEY = 'bibliary.summaryStyle';

export type SummaryFontId = 'system' | 'serif' | 'mono';

export const SUMMARY_FONTS: Record<
  SummaryFontId,
  { label: string; fontFamily?: string }
> = {
  system: {
    label: 'Sistema',
  },
  serif: {
    label: 'Serif',
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
  mono: {
    label: 'Monoespacio',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
};

export const SUMMARY_FONT_IDS = Object.keys(SUMMARY_FONTS) as SummaryFontId[];

export const SUMMARY_FONT_SIZE_LIMITS = {
  min: 12,
  max: 22,
  step: 1,
} as const;

export type SummaryStyleSettings = {
  font: SummaryFontId;
  fontSize: number;
};

export const DEFAULT_SUMMARY_STYLE: SummaryStyleSettings = {
  font: 'system',
  fontSize: 14,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: Partial<SummaryStyleSettings>): SummaryStyleSettings {
  const font =
    typeof value.font === 'string' &&
    SUMMARY_FONT_IDS.includes(value.font as SummaryFontId)
      ? (value.font as SummaryFontId)
      : DEFAULT_SUMMARY_STYLE.font;

  const fontSize =
    typeof value.fontSize === 'number' && Number.isFinite(value.fontSize)
      ? clamp(
          Math.round(value.fontSize),
          SUMMARY_FONT_SIZE_LIMITS.min,
          SUMMARY_FONT_SIZE_LIMITS.max,
        )
      : DEFAULT_SUMMARY_STYLE.fontSize;

  return { font, fontSize };
}

export async function loadSummaryStyle(): Promise<SummaryStyleSettings> {
  const saved = await getItem(SETTINGS_KEY);

  if (!saved) {
    return DEFAULT_SUMMARY_STYLE;
  }

  try {
    return normalize(JSON.parse(saved) as Partial<SummaryStyleSettings>);
  } catch {
    return DEFAULT_SUMMARY_STYLE;
  }
}

export async function saveSummaryStyle(
  settings: SummaryStyleSettings,
): Promise<void> {
  await setItem(SETTINGS_KEY, JSON.stringify(normalize(settings)));
}
