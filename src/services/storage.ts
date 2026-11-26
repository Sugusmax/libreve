import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

// Las claves conservan el prefijo histórico `bibliary.` para no perder los
// datos guardados tras renombrar el proyecto a Libreve.
const isWeb = Platform.OS === 'web';

const DATA_DIRECTORY = `${FileSystem.documentDirectory ?? ''}libreve-data/`;
let directoryReady: Promise<void> | null = null;

function ensureDirectory(): Promise<void> {
  if (!directoryReady) {
    directoryReady = (async () => {
      const info = await FileSystem.getInfoAsync(DATA_DIRECTORY);

      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(DATA_DIRECTORY, {
          intermediates: true,
        });
      }
    })().catch((error) => {
      directoryReady = null;
      throw error;
    });
  }

  return directoryReady;
}

function filePath(key: string): string {
  return `${DATA_DIRECTORY}${encodeURIComponent(key)}.json`;
}

// Serializa las operaciones de archivo para que una migración o un borrado no
// se pise con una escritura que llegue al mismo tiempo.
let pending: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(task, task);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readFile(key: string): Promise<string | null> {
  await ensureDirectory();
  const path = filePath(key);
  const info = await FileSystem.getInfoAsync(path);

  return info.exists ? FileSystem.readAsStringAsync(path) : null;
}

async function writeFile(key: string, value: string): Promise<void> {
  await ensureDirectory();
  await FileSystem.writeAsStringAsync(filePath(key), value);
}

async function removeLegacyValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Si no se puede borrar, el valor migrado en archivos sigue siendo válido.
  }
}

// Los datos que antes vivían en SecureStore se copian una sola vez al
// almacenamiento de archivos, que no tiene el límite de 2048 bytes.
async function migrateLegacyValue(key: string): Promise<string | null> {
  try {
    const legacy = await SecureStore.getItemAsync(key);

    if (legacy === null) {
      return null;
    }

    await writeFile(key, legacy);
    await removeLegacyValue(key);
    return legacy;
  } catch {
    return null;
  }
}

function webStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** Datos no secretos: archivos locales en móvil, localStorage en web. */
export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return webStorage()?.getItem(key) ?? null;
  }

  return runExclusive(async () => {
    const value = await readFile(key);

    if (value !== null) {
      await removeLegacyValue(key);
      return value;
    }

    return migrateLegacyValue(key);
  });
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }

  await runExclusive(async () => {
    await writeFile(key, value);
    await removeLegacyValue(key);
  });
}

export async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }

  await runExclusive(async () => {
    await ensureDirectory();
    await FileSystem.deleteAsync(filePath(key), { idempotent: true });
    await removeLegacyValue(key);
  });
}

/** Únicamente la clave de Gemini: SecureStore en móvil, localStorage en web. */
export async function getSecretItem(key: string): Promise<string | null> {
  if (isWeb) {
    return webStorage()?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

export async function setSecretItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function removeSecretItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
