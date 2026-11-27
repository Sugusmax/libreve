import * as Speech from 'expo-speech';
import { getItem, setItem } from './storage';

const READ_ALOUD_KEY = 'bibliary.readAloud';
const SETTINGS_KEY = 'bibliary.readAloudSettings';

export type ReadAloudSettings = {
  rate: number;
  pitch: number;
  commaPauseMs: number;
  periodPauseMs: number;
};

export const DEFAULT_READ_ALOUD_SETTINGS: ReadAloudSettings = {
  rate: 1,
  pitch: 1,
  commaPauseMs: 100,
  periodPauseMs: 250,
};

export const READ_ALOUD_LIMITS: Record<
  keyof ReadAloudSettings,
  { min: number; max: number; step: number }
> = {
  rate: { min: 0.6, max: 1.8, step: 0.1 },
  pitch: { min: 0.6, max: 1.6, step: 0.1 },
  commaPauseMs: { min: 0, max: 400, step: 50 },
  periodPauseMs: { min: 0, max: 800, step: 100 },
};

export type ReadAloudHandlers = {
  onDone?: () => void;
  onError?: () => void;
  isCancelled?: () => boolean;
};

type SpeechUnit = {
  text: string;
  pause: number;
};

let generation = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSettings(value: Partial<ReadAloudSettings>): ReadAloudSettings {
  const result = { ...DEFAULT_READ_ALOUD_SETTINGS };

  (Object.keys(READ_ALOUD_LIMITS) as (keyof ReadAloudSettings)[]).forEach(
    (key) => {
      const raw = value[key];

      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const limit = READ_ALOUD_LIMITS[key];
        result[key] = clamp(raw, limit.min, limit.max);
      }
    },
  );

  return result;
}

export async function loadReadAloud(): Promise<boolean> {
  const saved = await getItem(READ_ALOUD_KEY);

  return saved === 'true';
}

export async function saveReadAloud(enabled: boolean): Promise<void> {
  await setItem(READ_ALOUD_KEY, enabled ? 'true' : 'false');
}

export async function loadReadAloudSettings(): Promise<ReadAloudSettings> {
  const saved = await getItem(SETTINGS_KEY);

  if (!saved) {
    return DEFAULT_READ_ALOUD_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(saved) as Partial<ReadAloudSettings>);
  } catch {
    return DEFAULT_READ_ALOUD_SETTINGS;
  }
}

export async function saveReadAloudSettings(
  settings: ReadAloudSettings,
): Promise<void> {
  await setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function stopReading(): Promise<void> {
  generation += 1;

  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  return Speech.stop();
}

// Android limita el texto que acepta una sola llamada; dividimos por párrafos
// para que un capítulo largo no se corte ni falle a mitad de lectura.
function splitForSpeech(text: string, maxLength: number): string[] {
  const limit = Math.max(500, maxLength - 100);
  const source = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const part of source) {
    if (current.length + part.length + 1 <= limit) {
      current = current ? `${current}\n${part}` : part;
      continue;
    }

    pushCurrent();

    if (part.length <= limit) {
      current = part;
      continue;
    }

    // Un párrafo excepcionalmente largo se reparte por frases.
    const sentences =
      part.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [part];

    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > limit) {
        pushCurrent();
      }
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  pushCurrent();
  return chunks;
}

function buildUnits(
  text: string,
  settings: ReadAloudSettings,
): SpeechUnit[] {
  const units: SpeechUnit[] = [];
  const chunks = splitForSpeech(text, Speech.maxSpeechInputLength);

  for (const chunk of chunks) {
    const pieces =
      chunk.match(/[^,;.!?]+[,;.!?]?/g)?.map((piece) => piece.trim()) ?? [chunk];

    for (const piece of pieces) {
      if (!piece) {
        continue;
      }

      const ending = piece.slice(-1);
      const pause = '.!?'.includes(ending)
        ? settings.periodPauseMs
        : ',;'.includes(ending)
          ? settings.commaPauseMs
          : 0;

      units.push({ text: piece, pause });
    }
  }

  return units;
}

export function readText(
  text: string,
  handlers: ReadAloudHandlers,
  settings: ReadAloudSettings = DEFAULT_READ_ALOUD_SETTINGS,
): void {
  const currentGeneration = ++generation;
  const units = buildUnits(text, settings);
  let index = 0;

  const isActive = () =>
    currentGeneration === generation && !handlers.isCancelled?.();

  const speakNext = () => {
    if (!isActive()) {
      return;
    }

    if (index >= units.length) {
      handlers.onDone?.();
      return;
    }

    const unit = units[index];
    index += 1;

    Speech.speak(unit.text, {
      language: 'es',
      rate: settings.rate,
      pitch: settings.pitch,
      onDone: () => {
        if (!isActive()) {
          return;
        }

        const delay = Math.min(2000, Math.max(0, Number(unit.pause) || 0));

        if (delay > 0 && index < units.length) {
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            speakNext();
          }, delay);
          return;
        }

        speakNext();
      },
      onStopped: () => handlers.onDone?.(),
      onError: () => handlers.onError?.(),
    });
  };

  speakNext();
}
