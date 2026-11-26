import type { BookChapter, BookSuggestion } from './ai';
import { getItem, removeItem, setItem } from './storage';

const SUGGESTIONS_KEY = 'bibliary.suggestions';
const LAST_BOOK_KEY = 'bibliary.lastBook';
const LIBRARY_KEY = 'bibliary.library';
const CHAPTERS_PREFIX = 'bibliary.chapters.';
const SIMILAR_PREFIX = 'bibliary.similar.';

type LibraryIndexEntry = BookSuggestion & {
  // Momento del último capítulo guardado; permite ordenar por lectura reciente.
  updatedAt?: number;
  // Veces que se han abierto los resúmenes de este libro.
  readCount?: number;
};

export type LibraryEntry = {
  book: BookSuggestion;
  chapters: BookChapter[];
  updatedAt?: number;
  readCount?: number;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function bookKey(book: BookSuggestion): string {
  return `${normalize(book.title)}-${normalize(book.author)}`;
}

export function booksMatch(a: BookSuggestion, b: BookSuggestion): boolean {
  return bookKey(a) === bookKey(b);
}

function isBook(value: unknown): value is BookSuggestion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.title === 'string' &&
    typeof item.author === 'string' &&
    typeof item.reason === 'string'
  );
}

function isChapter(value: unknown): value is BookChapter {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.number === 'number' &&
    typeof item.title === 'string' &&
    typeof item.summary === 'string'
  );
}

async function readJson(key: string): Promise<unknown> {
  const raw = await getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadSuggestions(): Promise<BookSuggestion[]> {
  const parsed = await readJson(SUGGESTIONS_KEY);

  return Array.isArray(parsed) ? parsed.filter(isBook) : [];
}

export async function saveSuggestions(books: BookSuggestion[]): Promise<void> {
  await setItem(SUGGESTIONS_KEY, JSON.stringify(books));
}

export async function loadLastBook(): Promise<BookSuggestion | null> {
  const parsed = await readJson(LAST_BOOK_KEY);

  return isBook(parsed) ? parsed : null;
}

export async function saveLastBook(book: BookSuggestion): Promise<void> {
  await setItem(LAST_BOOK_KEY, JSON.stringify(book));
}

export async function clearLastBook(): Promise<void> {
  await removeItem(LAST_BOOK_KEY);
}

export async function clearSuggestions(): Promise<void> {
  await removeItem(SUGGESTIONS_KEY);
  await clearLastBook();
}

export async function loadChapters(book: BookSuggestion): Promise<BookChapter[]> {
  const parsed = await readJson(`${CHAPTERS_PREFIX}${bookKey(book)}`);

  return Array.isArray(parsed) ? parsed.filter(isChapter) : [];
}

export async function loadSimilarBooks(
  book: BookSuggestion,
): Promise<BookSuggestion[]> {
  const parsed = await readJson(`${SIMILAR_PREFIX}${bookKey(book)}`);

  return Array.isArray(parsed) ? parsed.filter(isBook).slice(0, 3) : [];
}

export async function saveSimilarBooks(
  book: BookSuggestion,
  books: BookSuggestion[],
): Promise<void> {
  await setItem(
    `${SIMILAR_PREFIX}${bookKey(book)}`,
    JSON.stringify(books.slice(0, 3)),
  );
}

async function loadLibraryBooks(): Promise<LibraryIndexEntry[]> {
  const parsed = await readJson(LIBRARY_KEY);

  return Array.isArray(parsed)
    ? (parsed.filter(isBook) as LibraryIndexEntry[])
    : [];
}

async function saveLibraryBooks(books: LibraryIndexEntry[]): Promise<void> {
  await setItem(LIBRARY_KEY, JSON.stringify(books));
}

export async function saveChapters(
  book: BookSuggestion,
  chapters: BookChapter[],
): Promise<void> {
  await setItem(
    `${CHAPTERS_PREFIX}${bookKey(book)}`,
    JSON.stringify(chapters),
  );

  try {
    // SecureStore no permite enumerar claves: mantenemos un índice de los libros.
    const books = await loadLibraryBooks();
    const existing = books.find((item) => booksMatch(item, book));
    const others = books.filter((item) => !booksMatch(item, book));
    const entry: LibraryIndexEntry = {
      ...book,
      updatedAt: Date.now(),
      ...(typeof existing?.readCount === 'number'
        ? { readCount: existing.readCount }
        : {}),
    };
    await saveLibraryBooks([entry, ...others]);
  } catch {
    // Si falla el índice, los capítulos ya quedaron guardados.
  }
}

export async function loadLibrary(): Promise<LibraryEntry[]> {
  let books = await loadLibraryBooks();
  const hasIndex = books.length > 0;

  if (!hasIndex) {
    // Migración de datos guardados antes de que existiera el índice.
    const [suggestions, lastBook] = await Promise.all([
      loadSuggestions(),
      loadLastBook(),
    ]);

    books = [...suggestions];

    if (lastBook && !books.some((book) => booksMatch(book, lastBook))) {
      books.push(lastBook);
    }
  }

  const entries = await Promise.all(
    books.map(async (book) => ({
      book,
      chapters: await loadChapters(book),
      ...(typeof book.updatedAt === 'number'
        ? { updatedAt: book.updatedAt }
        : {}),
      ...(typeof book.readCount === 'number'
        ? { readCount: book.readCount }
        : {}),
    })),
  );
  const saved = entries.filter((entry) => entry.chapters.length > 0);

  if (!hasIndex && saved.length > 0) {
    await saveLibraryBooks(saved.map((entry) => entry.book));
  }

  return saved;
}

/** Cuenta una lectura de los resúmenes ya guardados de un libro. */
export async function recordBookRead(book: BookSuggestion): Promise<void> {
  const books = await loadLibraryBooks();
  const hasEntry = books.some((item) => booksMatch(item, book));

  if (!hasEntry && (await loadChapters(book)).length === 0) {
    return;
  }

  const now = Date.now();
  const updated = hasEntry
    ? books.map((item) =>
        booksMatch(item, book)
          ? {
              ...item,
              readCount: (item.readCount ?? 0) + 1,
              updatedAt: now,
            }
          : item,
      )
    : [...books, { ...book, readCount: 1, updatedAt: now }];

  await saveLibraryBooks(updated);
}

/** Borra los capítulos, las sugerencias finales y el índice de un libro. */
export async function deleteBookSummary(book: BookSuggestion): Promise<void> {
  await Promise.all([
    removeItem(`${CHAPTERS_PREFIX}${bookKey(book)}`),
    removeItem(`${SIMILAR_PREFIX}${bookKey(book)}`),
  ]);

  const books = await loadLibraryBooks();
  await saveLibraryBooks(books.filter((item) => !booksMatch(item, book)));

  const lastBook = await loadLastBook();

  if (lastBook && booksMatch(lastBook, book)) {
    await clearLastBook();
  }
}
