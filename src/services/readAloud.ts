import * as Speech from 'expo-speech';
import { getItem, setItem } from './storage';

const READ_ALOUD_KEY = 'bibliary.readAloud';

export type ReadAloudHandlers = {
  onDone?: () => void;
  onError?: () => void;
  isCancelled?: () => boolean;
};

export async function loadReadAloud(): Promise<boolean> {
  const saved = await getItem(READ_ALOUD_KEY);

  return saved === 'true';
}

export async function saveReadAloud(enabled: boolean): Promise<void> {
  await setItem(READ_ALOUD_KEY, enabled ? 'true' : 'false');
}

export function stopReading(): Promise<void> {
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

export function readText(text: string, handlers: ReadAloudHandlers): void {
  const chunks = splitForSpeech(text, Speech.maxSpeechInputLength);
  let index = 0;

  const speakNext = () => {
    if (handlers.isCancelled?.()) {
      return;
    }

    if (index >= chunks.length) {
      handlers.onDone?.();
      return;
    }

    const chunk = chunks[index];
    index += 1;

    Speech.speak(chunk, {
      language: 'es',
      rate: 1,
      onDone: speakNext,
      onStopped: () => handlers.onDone?.(),
      onError: () => handlers.onError?.(),
    });
  };

  speakNext();
}
