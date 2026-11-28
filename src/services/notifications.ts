import { AppState, NativeModules, Platform, type AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import type { BookSuggestion } from './ai';
import { upgradeCoverUrl } from './covers';
import {
  getBookKey,
  loadLibrary,
  loadSimilarBooks,
  loadSuggestions,
} from './library';
import { getItem, setItem } from './storage';

const SETTINGS_KEY = 'bibliary.notificaciones';
const CHANNEL_ID = 'libreve_recomendaciones';
const FIRST_DELAY_MS = 10 * 60 * 60 * 1000;
const RESYNC_AFTER_MS = 23 * 60 * 60 * 1000;

type Settings = {
  enabled: boolean;
  // Hora local de la primera notificación; de ahí en adelante se repite cada día.
  hour?: number;
  minute?: number;
  lastBookKey?: string;
  lastScheduledAt?: number;
  turn?: number;
};

type NativeNotifications = {
  scheduleDaily: (
    title: string,
    body: string,
    coverUri: string,
    hour: number,
    minute: number,
  ) => Promise<boolean>;
  cancel: () => Promise<boolean>;
};

const native = NativeModules.LibreveNotifications as
  | NativeNotifications
  | undefined;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    // El sonido se desactiva también en el canal de Android.
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const MESSAGES = [
  'Estamos seguros de que este título te va a encantar',
  'En 10 minutos podrías conocer lo mejor de este libro',
];

let appStateSubscription: { remove: () => void } | null = null;
let previousState: AppStateStatus = AppState.currentState;

async function loadSettings(): Promise<Settings> {
  const raw = await getItem(SETTINGS_KEY);

  if (!raw) {
    return { enabled: true };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return { enabled: true };
    }

    const value = parsed as Partial<Settings>;
    return {
      enabled: value.enabled !== false,
      ...(typeof value.hour === 'number' ? { hour: value.hour } : {}),
      ...(typeof value.minute === 'number' ? { minute: value.minute } : {}),
      ...(typeof value.lastBookKey === 'string'
        ? { lastBookKey: value.lastBookKey }
        : {}),
      ...(typeof value.lastScheduledAt === 'number'
        ? { lastScheduledAt: value.lastScheduledAt }
        : {}),
      ...(typeof value.turn === 'number' ? { turn: value.turn } : {}),
    };
  } catch {
    return { enabled: true };
  }
}

async function saveSettings(settings: Settings): Promise<void> {
  await setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function hasPermission(request: boolean): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recomendaciones de lectura',
      description: 'Una sugerencia de libro por día, basada en tus intereses.',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();

  if (current.granted || !request) {
    return current.granted;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });

  return requested.granted;
}

function uniqueBooks(books: BookSuggestion[]): BookSuggestion[] {
  const keys = new Set<string>();

  return books.filter((book) => {
    const key = getBookKey(book);

    if (keys.has(key)) {
      return false;
    }

    keys.add(key);
    return true;
  });
}

async function loadCandidates(): Promise<BookSuggestion[]> {
  const [suggestions, library] = await Promise.all([
    loadSuggestions(),
    loadLibrary(),
  ]);
  const similar = (
    await Promise.all(
      library.slice(0, 3).map((entry) => loadSimilarBooks(entry.book)),
    )
  ).flat();
  const all = uniqueBooks([...similar, ...suggestions]);
  const readKeys = new Set(library.map((entry) => getBookKey(entry.book)));
  const unread = all.filter((book) => !readKeys.has(getBookKey(book)));

  return (unread.length > 0 ? unread : all).slice(0, 12);
}

function pickBook(books: BookSuggestion[], lastKey?: string): BookSuggestion {
  if (books.length === 1) {
    return books[0];
  }

  let index = Math.floor(Math.random() * books.length);

  if (getBookKey(books[index]) === lastKey) {
    index = (index + 1) % books.length;
  }

  return books[index];
}

async function downloadCover(book: BookSuggestion): Promise<string | null> {
  const url = book.coverLargeUrl ?? upgradeCoverUrl(book.coverUrl) ?? book.coverUrl;

  if (!url) {
    return null;
  }

  const name = getBookKey(book).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 70);
  const path = `${FileSystem.cacheDirectory}libreve-cover-${name || 'libro'}.jpg`;

  try {
    const info = await FileSystem.getInfoAsync(path);

    if (!info.exists) {
      const result = await FileSystem.downloadAsync(url, path);

      if (result.status !== 200) {
        return null;
      }
    }

    return `file://${path}`;
  } catch {
    return null;
  }
}

function buildMessage(book: BookSuggestion, turn: number) {
  const detail = [book.title, book.author].filter(Boolean).join(' · ');
  const reason = book.reason ? ` ${book.reason}` : '';

  return {
    title: MESSAGES[turn % MESSAGES.length],
    body: `${detail}.${reason}`,
  };
}

async function cancelNative(): Promise<void> {
  await native?.cancel().catch(() => undefined);
  await Notifications.cancelAllScheduledNotificationsAsync().catch(
    () => undefined,
  );
}

async function schedule(
  book: BookSuggestion,
  coverUri: string | null,
  turn: number,
  hour: number,
  minute: number,
) {
  const { title, body } = buildMessage(book, turn);

  if (Platform.OS === 'android' && native) {
    await native.scheduleDaily(title, body, coverUri ?? '', hour, minute);
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: false,
      attachments: coverUri
        ? [
            {
              identifier: 'libreve-cover',
              url: coverUri,
              type: 'public.jpeg',
              typeHint: 'jpg',
            },
          ]
        : undefined,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      channelId: CHANNEL_ID,
    },
  });
}

/**
 * La primera notificación se programa cuando la app pasa a segundo plano:
 * 10 horas después y, desde ese momento, una vez al día a la misma hora.
 */
async function onAppBackground(): Promise<void> {
  const settings = await loadSettings();

  if (
    !settings.enabled ||
    settings.hour !== undefined ||
    settings.minute !== undefined
  ) {
    return;
  }

  if (!(await hasPermission(false))) {
    return;
  }

  const candidates = await loadCandidates();

  if (candidates.length === 0) {
    return;
  }

  const book = pickBook(candidates, settings.lastBookKey);
  const coverUri = await downloadCover(book);
  const when = new Date(Date.now() + FIRST_DELAY_MS);
  const hour = when.getHours();
  const minute = when.getMinutes();

  await cancelNative();
  await schedule(book, coverUri, 0, hour, minute);
  await saveSettings({
    enabled: true,
    hour,
    minute,
    lastBookKey: getBookKey(book),
    lastScheduledAt: Date.now(),
    turn: 0,
  });
}

/** Escucha el cierre de la app para iniciar el contador de 10 horas. */
export function initializeNotifications(): void {
  if (Platform.OS === 'web' || appStateSubscription) {
    return;
  }

  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (next === 'background' && previousState !== 'background') {
      void onAppBackground();
    }

    previousState = next;
  });
}

/**
 * Renueva el contenido de la notificación diaria sin cambiar su hora. Antes de
 * la primera salida solo solicita el permiso; el temporizador arranca al cerrar.
 */
export async function syncDailyRecommendation(force = false): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const settings = await loadSettings();

  if (!settings.enabled) {
    await cancelNative();
    return;
  }

  if (settings.hour === undefined || settings.minute === undefined) {
    await hasPermission(true);
    return;
  }

  if (
    !force &&
    settings.lastScheduledAt &&
    Date.now() - settings.lastScheduledAt < RESYNC_AFTER_MS
  ) {
    return;
  }

  if (!(await hasPermission(false))) {
    await cancelNative();
    return;
  }

  const candidates = await loadCandidates();

  if (candidates.length === 0) {
    await cancelNative();
    return;
  }

  const book = pickBook(candidates, settings.lastBookKey);
  const coverUri = await downloadCover(book);
  const turn = (settings.turn ?? 0) + 1;

  await cancelNative();
  await schedule(book, coverUri, turn, settings.hour, settings.minute);
  await saveSettings({
    ...settings,
    lastBookKey: getBookKey(book),
    lastScheduledAt: Date.now(),
    turn,
  });
}

export async function isNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const [settings, permissions] = await Promise.all([
    loadSettings(),
    Notifications.getPermissionsAsync(),
  ]);

  return settings.enabled && permissions.granted;
}

/** Activa o desactiva las recomendaciones; devuelve el estado efectivo. */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  if (!enabled) {
    await saveSettings({ enabled: false });
    await cancelNative();
    return false;
  }

  if (!(await hasPermission(true))) {
    return false;
  }

  // Sin hora guardada: el próximo cierre de la app decide cuándo será la primera.
  await saveSettings({ enabled: true });
  return true;
}

export async function cancelNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await saveSettings({ enabled: false });
  await cancelNative();
}
