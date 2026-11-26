import {
  getProvider,
  isProviderId,
  type AiProvider,
  type ProviderId,
} from '../data/providers';
import {
  getSecretItem,
  removeSecretItem,
  setSecretItem,
  getItem,
  setItem,
} from './storage';

// Clave histórica: guardaba la de Gemini antes de existir el selector.
const LEGACY_API_KEY = 'bibliary.apiKey';
const SELECTED_PROVIDER_KEY = 'bibliary.provider';

function keyStorageKey(providerId: ProviderId): string {
  return `bibliary.apiKey.${providerId}`;
}

export async function loadProviderId(): Promise<ProviderId> {
  const saved = await getItem(SELECTED_PROVIDER_KEY);
  return isProviderId(saved) ? saved : 'gemini';
}

export async function saveProviderId(providerId: ProviderId): Promise<void> {
  await setItem(SELECTED_PROVIDER_KEY, providerId);
}

export async function loadActiveProvider(): Promise<AiProvider> {
  return getProvider(await loadProviderId());
}

/** Carga la clave del proveedor indicado o del que esté activo. */
export async function loadApiKey(
  providerId?: ProviderId,
): Promise<string | null> {
  const id = providerId ?? (await loadProviderId());

  if (id === 'gemini') {
    const key = await getSecretItem(keyStorageKey(id));

    if (key) {
      return key;
    }

    // Los datos de versiones anteriores se migran en la primera lectura.
    const legacy = await getSecretItem(LEGACY_API_KEY);

    if (legacy) {
      await setSecretItem(keyStorageKey(id), legacy);
      await removeSecretItem(LEGACY_API_KEY);
      return legacy;
    }

    return null;
  }

  return getSecretItem(keyStorageKey(id));
}

export async function saveApiKey(
  apiKey: string,
  providerId?: ProviderId,
): Promise<string> {
  const key = apiKey.trim();

  if (!key) {
    throw new Error('Ingresa una clave antes de continuar.');
  }

  const id = providerId ?? (await loadProviderId());
  await setSecretItem(keyStorageKey(id), key);
  await saveProviderId(id);

  if (id === 'gemini') {
    await removeSecretItem(LEGACY_API_KEY);
  }

  return key;
}

export async function clearApiKey(providerId?: ProviderId): Promise<void> {
  const id = providerId ?? (await loadProviderId());
  await removeSecretItem(keyStorageKey(id));

  if (id === 'gemini') {
    await removeSecretItem(LEGACY_API_KEY);
  }
}
