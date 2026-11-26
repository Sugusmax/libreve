import { getItem, removeItem, setItem } from './storage';

const INTERESTS_KEY = 'bibliary.interests';
const COMPLETED_KEY = 'bibliary.interestsCompleted';

export async function loadInterests(): Promise<string[]> {
  const raw = await getItem(INTERESTS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function saveInterests(ids: string[]): Promise<void> {
  await setItem(INTERESTS_KEY, JSON.stringify(ids));
  await setItem(COMPLETED_KEY, 'true');
}

export async function hasCompletedInterests(): Promise<boolean> {
  return (await getItem(COMPLETED_KEY)) === 'true';
}

export async function clearInterests(): Promise<void> {
  await removeItem(INTERESTS_KEY);
  await removeItem(COMPLETED_KEY);
}
