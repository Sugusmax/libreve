import { useState } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import BackLink from '../components/BackLink';
import PrimaryButton from '../components/PrimaryButton';
import {
  SEARCH_PAGE_SIZE,
  searchBookIdentity,
  searchBooks,
  type SearchedBook,
} from '../services/bookSearch';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type SearchScreenProps = {
  onBack: () => void;
  onOpenLibrary: () => void;
  onSelectBook: (book: SearchedBook) => void;
};

export default function SearchScreen({
  onBack,
  onOpenLibrary,
  onSelectBook,
}: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchedBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    const term = query.trim();

    if (term.length < 2) {
      setStatus('Escribe al menos 2 caracteres para buscar.');
      return;
    }

    setIsLoading(true);
    setStatus('');

    try {
      const page = await searchBooks(term, 0);
      setSearchTerm(term);
      setResults(page.books);
      setNextOffset(SEARCH_PAGE_SIZE);
      setTotal(page.total);
      setHasSearched(true);
      setStatus(
        page.books.length === 0
          ? `No encontramos libros para «${term}».`
          : `${page.books.length} de ${page.total} ${
              page.total === 1 ? 'libro encontrado' : 'libros encontrados'
            }.`,
      );
    } catch (error) {
      setResults([]);
      setTotal(0);
      setStatus(
        error instanceof Error ? error.message : 'No se pudo completar la búsqueda.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!searchTerm || isLoading || isLoadingMore || nextOffset >= total) {
      return;
    }

    setIsLoadingMore(true);
    setStatus('');

    try {
      const page = await searchBooks(searchTerm, nextOffset);
      const known = new Set(results.map(searchBookIdentity));
      const fresh = page.books.filter(
        (book) => !known.has(searchBookIdentity(book)),
      );

      setResults((current) => [...current, ...fresh]);
      setNextOffset(nextOffset + SEARCH_PAGE_SIZE);
      setTotal(page.total);
      setStatus(
        fresh.length === 0
          ? 'No hay más resultados nuevos para mostrar.'
          : `${results.length + fresh.length} de ${page.total} libros encontrados.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'No se pudieron cargar más libros.',
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CATÁLOGO COMPLETO</Text>
          <Text style={styles.title}>Buscar libros</Text>
          <Text style={styles.description}>
            Encuentra cualquier libro por título, autor o tema y resúmelo por
            capítulos con tu IA.
          </Text>

          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void handleSearch()}
            placeholder="Título, autor o tema"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            editable={!isLoading}
            accessibilityLabel="Buscar libros"
          />
          <PrimaryButton
            label={isLoading ? 'Buscando…' : 'Buscar'}
            onPress={() => void handleSearch()}
            disabled={isLoading}
          />

          <Text style={styles.status}>{status}</Text>

          {results.map((book, index) => (
            <TouchableOpacity
              key={`${book.title}-${book.author}-${index}`}
              style={styles.bookRow}
              onPress={() => onSelectBook(book)}
              accessibilityRole="button"
              accessibilityLabel={`Resumir ${book.title}`}
            >
              <Image
                source={{ uri: book.coverUrl }}
                style={styles.cover}
                resizeMode="cover"
                accessibilityLabel={`Portada de ${book.title}`}
              />
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle}>{book.title}</Text>
                <Text style={styles.bookAuthor}>{book.author}</Text>
                <Text style={styles.bookMeta}>
                  {book.year ? `Publicado en ${book.year}` : 'Año desconocido'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {results.length > 0 && nextOffset < total ? (
            <PrimaryButton
              label={
                isLoadingMore
                  ? 'Cargando más…'
                  : `Mostrar ${Math.min(SEARCH_PAGE_SIZE, total - nextOffset)} más`
              }
              onPress={() => void handleLoadMore()}
              disabled={isLoadingMore}
            />
          ) : null}

          {hasSearched && results.length === 0 && !isLoading ? (
            <Text style={styles.hint}>
              Prueba con otro título o con el nombre del autor.
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => void Linking.openURL('https://openlibrary.org/')}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Datos y portadas de Open Library</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenLibrary} accessibilityRole="button">
            <Text style={styles.link}>Mi biblioteca</Text>
          </TouchableOpacity>
          <BackLink label="Volver" onPress={onBack} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: '6%',
    paddingVertical: metrics.spacing.xl,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: metrics.radius.lg,
    padding: metrics.spacing.lg,
    gap: metrics.spacing.md,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: metrics.radius.md,
    shadowOffset: { width: 0, height: scale(6) },
    elevation: 3,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: metrics.font.eyebrow,
    fontWeight: '700',
    letterSpacing: scale(1.4),
    textAlign: 'center',
  },
  title: {
    color: colors.primaryDark,
    fontSize: metrics.font.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: colors.muted,
    fontSize: metrics.font.body,
    lineHeight: scale(20),
    textAlign: 'center',
  },
  input: {
    alignSelf: 'stretch',
    borderWidth: scale(1),
    borderColor: colors.border,
    borderRadius: metrics.radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: metrics.spacing.sm,
    paddingVertical: metrics.spacing.sm,
    color: colors.text,
    fontSize: metrics.font.input,
  },
  status: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  bookRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.spacing.sm,
    paddingBottom: metrics.spacing.sm,
    borderBottomWidth: scale(1),
    borderBottomColor: colors.border,
  },
  cover: {
    width: scale(64),
    height: scale(96),
    borderRadius: metrics.radius.sm,
    backgroundColor: colors.hint,
  },
  bookInfo: {
    flex: 1,
    gap: metrics.spacing.xs,
  },
  bookTitle: {
    color: colors.text,
    fontSize: metrics.font.body,
    fontWeight: '700',
  },
  bookAuthor: {
    color: colors.accent,
    fontSize: metrics.font.body,
    fontWeight: '600',
  },
  bookMeta: {
    color: colors.muted,
    fontSize: metrics.font.body,
  },
  hint: {
    color: colors.muted,
    fontSize: metrics.font.body,
    textAlign: 'center',
  },
  link: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
