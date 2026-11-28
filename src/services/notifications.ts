import { NativeModules, Platform } from 'react-native';
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
const DAILY_HOUR = 9;
const DAILY_MINUTE = 0;
const RESYNC_AFTER_MS = 23 * 60 * 60 * 1000;

type Settings = {
  enabled: boolean;
  lastBookKey?: string;
  lastScheduledAt?: number;
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
      ...(typeof value.lastBookKey === 'string'
        ? { lastBookKey: value.lastBookKey }
        : {}),
      ...(typeof value.lastScheduledAt === 'number'
        ? { lastScheduledAt: value.lastScheduledAt }
        : {}),
    };
  } catch {
    return { enabled: true };
  }
}

async function saveSettings(settings: Settings): Promise<void> {
  await setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function hasPermission(): Promise<boolean> {
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

  if (current.granted) {
    return true;
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
    await Promise.all(library.slice(0, 3).map((entry) => loadSimilarBooks(entry.book)))
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

async function schedule(book: BookSuggestion, coverUri: string | null, turn: number) {
  const { title, body } = buildMessage(book, turn);

  if (Platform.OS === 'android' && native) {
    await native.scheduleDaily(
      title,
      body,
      coverUri ?? '',
      DAILY_HOUR,
      DAILY_MINUTE,
    );
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
      hour: DAILY_HOUR,
      minute: DAILY_MINUTE,
      repeats: true,
      channelId: CHANNEL_ID,
    },
  });
}

/** Programa (o renueva) una recomendación diaria usando solo datos locales. */
export async function syncDailyRecommendation(force = false): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const settings = await loadSettings();

  if (!settings.enabled) {
    await cancelNative();
    return;
  }

  if (
    !force &&
    settings.lastScheduledAt &&
    Date.now() - settings.lastScheduledAt < RESYNC_AFTER_MS
  ) {
    return;
  }

  const allowed = await hasPermission();

  if (!allowed) {
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
  const turn = settings.lastScheduledAt ? 1 : 0;

  await cancelNative();
  await schedule(book, coverUri, turn);
  await saveSettings({
    enabled: true,
    lastBookKey: getBookKey(book),
    lastScheduledAt: Date.now(),
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
  if (Platform.OS === 'web' || !enabled) {
    const settings = await loadSettings();
    await saveSettings({ ...settings, enabled: false });
    await cancelNative();
    return false;
  }

  const allowed = await hasPermission();

  if (!allowed) {
    return false;
  }

  await saveSettings({ ...(await loadSettings()), enabled: true });
  await syncDailyRecommendation(true);
  return true;
}

export async function cancelNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const settings = await loadSettings();
  await saveSettings({ ...settings, enabled: false });
  await cancelNative();
}
