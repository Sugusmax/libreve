type OpenLibraryDoc = {
  cover_i?: unknown;
};

type OpenverseImage = {
  url?: unknown;
  thumbnail?: unknown;
  license?: unknown;
  provider?: unknown;
};

export type CoverInfo = {
  // Miniatura para las listas.
  url: string;
  // Imagen de mayor resolución para el visor a pantalla completa.
  largeUrl: string;
  license: string;
  source: string;
};

// Imagen CC0 de Openverse usada si no hay resultados para un libro concreto.
const FALLBACK_COVER =
  'https://api.openverse.org/v1/images/2165cd73-6c7f-404f-b2dc-442393c5660a/thumb/';
const FALLBACK_COVER_LARGE =
  'https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL3B4NTQxMjY0LWltYWdlLWt6MmU5ZW03LmpwZw.jpg';

/** Portada CC0 usada cuando la obra no tiene imagen en ningún catálogo. */
export function getFallbackCover(): CoverInfo {
  return {
    url: FALLBACK_COVER,
    largeUrl: FALLBACK_COVER_LARGE,
    license: 'cc0',
    source: 'Openverse',
  };
}

/**
 * Open Library permite mostrar sus portadas desde covers.openlibrary.org.
 * La imagen se sirve desde su dominio (no se descarga ni se redistribuye).
 */
async function searchOpenLibrary(query: string): Promise<CoverInfo | null> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5&fields=cover_i`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
    const doc = data.docs?.find(
      (item) => typeof item.cover_i === 'number' && item.cover_i > 0,
    ) as (OpenLibraryDoc & { cover_i: number }) | undefined;

    if (!doc) {
      return null;
    }

    return {
      url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`,
      largeUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`,
      license: 'Open Library',
      source: 'Open Library',
    };
  } catch {
    return null;
  }
}

async function searchOpenverse(query: string): Promise<CoverInfo | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=cc0,pdm&page_size=3`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { results?: OpenverseImage[] };
    const item = data.results?.find(
      (result) =>
        typeof result.url === 'string' && typeof result.thumbnail === 'string',
    ) as
      | (OpenverseImage & { url: string; thumbnail: string })
      | undefined;

    if (!item) {
      return null;
    }

    return {
      url: item.thumbnail,
      largeUrl: item.url,
      license: typeof item.license === 'string' ? item.license : 'cc0',
      source: typeof item.provider === 'string' ? item.provider : 'Openverse',
    };
  } catch {
    return null;
  }
}

export async function fetchCover(
  title: string,
  author: string,
): Promise<CoverInfo> {
  const withAuthor = await searchOpenLibrary(`${title} ${author}`);
  const byTitle = withAuthor ? null : await searchOpenLibrary(title);
  const ccImage = withAuthor || byTitle ? null : await searchOpenverse(title);

  return withAuthor ?? byTitle ?? ccImage ?? getFallbackCover();
}

/**
 * Para libros guardados antes de tener la URL grande, la derivamos de la
 * miniatura cuando es posible. Si no, el visor usa la imagen pequeña.
 */
export function upgradeCoverUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  if (url === FALLBACK_COVER) {
    return FALLBACK_COVER_LARGE;
  }

  return url.replace(/-(?:S|M)\.jpg(\?.*)?$/, '-L.jpg$1');
}
