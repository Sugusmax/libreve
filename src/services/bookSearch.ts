import type { BookSuggestion } from './ai';
import { getFallbackCover } from './covers';

type OpenLibraryDoc = {
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  cover_i?: unknown;
  cover_edition_key?: unknown;
};

export type SearchedBook = BookSuggestion & {
  // Año de primera publicación, cuando Open Library lo conoce.
  year?: number;
};

function coverUrls(doc: OpenLibraryDoc): { small: string; large: string } | null {
  if (typeof doc.cover_i === 'number' && doc.cover_i > 0) {
    return {
      small: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`,
      large: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`,
    };
  }

  if (typeof doc.cover_edition_key === 'string' && doc.cover_edition_key) {
    return {
      small: `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-M.jpg?default=false`,
      large: `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-L.jpg?default=false`,
    };
  }

  return null;
}

/**
 * Busca en el catálogo de Open Library directamente desde el cliente, sin key
 * ni backend. No sustituye a las sugerencias de la IA: permite resumir cualquier
 * libro, esté o no en la selección del usuario.
 */
export async function searchBooks(query: string): Promise<SearchedBook[]> {
  const term = query.trim();

  if (term.length < 2) {
    return [];
  }

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    term,
  )}&limit=20&fields=title,author_name,first_publish_year,cover_i,cover_edition_key`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      'No se pudo buscar en Open Library. Comprueba tu conexión e inténtalo de nuevo.',
    );
  }

  const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
  const fallback = getFallbackCover();
  const seen = new Set<string>();

  return (data.docs ?? []).flatMap((doc): SearchedBook[] => {
    const title = typeof doc.title === 'string' ? doc.title.trim() : '';

    if (!title) {
      return [];
    }

    const author =
      Array.isArray(doc.author_name) && typeof doc.author_name[0] === 'string'
        ? doc.author_name[0]
        : 'Autor desconocido';

    const identity = `${title.toLowerCase()}|${author.toLowerCase()}`;

    if (seen.has(identity)) {
      return [];
    }

    seen.add(identity);

    const cover = coverUrls(doc);
    const year =
      typeof doc.first_publish_year === 'number'
        ? doc.first_publish_year
        : undefined;

    return [
      {
        title,
        author,
        reason: 'Obra encontrada en Open Library.',
        coverUrl: cover?.small ?? fallback.url,
        coverLargeUrl: cover?.large ?? fallback.largeUrl,
        coverLicense: cover ? 'Open Library' : fallback.license,
        coverSource: cover ? 'Open Library' : fallback.source,
        ...(year ? { year } : {}),
      },
    ];
  });
}
