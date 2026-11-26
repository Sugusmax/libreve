import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import BookSummaryScreen from './src/screens/BookSummaryScreen';
import HomeScreen from './src/screens/HomeScreen';
import InterestsScreen from './src/screens/InterestsScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';
import SuggestionsScreen from './src/screens/SuggestionsScreen';
import { loadApiKey } from './src/services/apiKey';
import type { BookSuggestion } from './src/services/ai';
import {
  booksMatch,
  clearLastBook,
  clearSuggestions,
  loadLastBook,
  loadSuggestions,
  saveLastBook,
  saveSuggestions,
} from './src/services/library';
import { hasCompletedInterests, loadInterests } from './src/services/preferences';
import { colors } from './src/theme/colors';

type Screen =
  | 'home'
  | 'interests'
  | 'recommendations'
  | 'suggestions'
  | 'bookSummary'
  | 'library';

type LibraryOrigin = 'suggestions' | 'recommendations';
type SummaryOrigin = 'suggestions' | 'library';

function sameInterests(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function getRestoredScreen(
  savedApiKey: string,
  completed: boolean,
  savedSuggestions: BookSuggestion[],
  hasSelectedBook: boolean,
): Screen {
  if (!savedApiKey) {
    return 'home';
  }

  if (!completed) {
    return 'interests';
  }

  if (savedSuggestions.length > 0) {
    return hasSelectedBook ? 'bookSummary' : 'suggestions';
  }

  return 'recommendations';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [apiKey, setApiKey] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookSuggestion | null>(null);
  const [libraryOrigin, setLibraryOrigin] =
    useState<LibraryOrigin>('recommendations');
  const [summaryOrigin, setSummaryOrigin] =
    useState<SummaryOrigin>('suggestions');
  const [isReady, setIsReady] = useState(false);
  const [interestsCompleted, setInterestsCompleted] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [
          apiKey,
          completed,
          savedInterests,
          savedSuggestions,
          savedBook,
        ] = await Promise.all([
          loadApiKey(),
          hasCompletedInterests(),
          loadInterests(),
          loadSuggestions(),
          loadLastBook(),
        ]);

        if (!active) {
          return;
        }

        setInterests(savedInterests);
        setApiKey(apiKey ?? '');
        setInterestsCompleted(completed);

        if (savedSuggestions.length > 0) {
          setSuggestions(savedSuggestions);

          if (
            savedBook &&
            savedSuggestions.some((book) => booksMatch(book, savedBook))
          ) {
            setSelectedBook(savedBook);
          }
        }

        setScreen(
          getRestoredScreen(
            apiKey ?? '',
            completed,
            savedSuggestions,
            Boolean(
              savedBook &&
                savedSuggestions.some((book) => booksMatch(book, savedBook)),
            ),
          ),
        );
      } catch {
        if (active) {
          setScreen('home');
        }
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleResetInterests = () => {
    // Conservamos los intereses guardados para que aparezcan seleccionados.
    // Las sugerencias solo se descartan si al guardar han cambiado los temas.
    setScreen('interests');
  };

  const openLibrary = (from: LibraryOrigin) => {
    setLibraryOrigin(from);
    setScreen('library');
  };

  const openBook = (book: BookSuggestion, from: SummaryOrigin) => {
    setSelectedBook(book);
    setSummaryOrigin(from);
    void saveLastBook(book);
    setScreen('bookSummary');
  };

  const closeBook = () => {
    setSelectedBook(null);
    void clearLastBook();
    setScreen(summaryOrigin === 'library' ? 'library' : 'suggestions');
  };

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (screen === 'home') {
    return (
      <HomeScreen
        initialApiKey={apiKey}
        onKeyReady={(key) => {
          setApiKey(key);
          setLibraryOrigin('recommendations');
          setSummaryOrigin('suggestions');

          if (!interestsCompleted) {
            setScreen('interests');
            return;
          }

          // Cambiar de clave no cambia los intereses: reutilizamos las
          // sugerencias guardadas para no gastar peticiones nuevas.
          setScreen(suggestions.length > 0 ? 'suggestions' : 'recommendations');
        }}
      />
    );
  }

  if (screen === 'interests') {
    return (
      <InterestsScreen
        initialInterests={interests}
        onComplete={(ids) => {
          const changed = !sameInterests(ids, interests);

          setInterests(ids);
          setInterestsCompleted(true);
          setLibraryOrigin('recommendations');
          setSummaryOrigin('suggestions');

          if (changed) {
            setSuggestions([]);
            setSelectedBook(null);
            void clearSuggestions();
            setScreen('recommendations');
            return;
          }

          setScreen(suggestions.length > 0 ? 'suggestions' : 'recommendations');
        }}
      />
    );
  }

  if (screen === 'suggestions') {
    return (
      <SuggestionsScreen
        books={suggestions}
        onBack={() => setScreen('recommendations')}
        onOpenLibrary={() => openLibrary('suggestions')}
        onSelectBook={(book) => openBook(book, 'suggestions')}
      />
    );
  }

  if (screen === 'bookSummary' && selectedBook) {
    return (
      <BookSummaryScreen
        key={`${selectedBook.title}|${selectedBook.author}`}
        book={selectedBook}
        backLabel={
          summaryOrigin === 'library'
            ? 'Volver a la biblioteca'
            : 'Volver a sugerencias'
        }
        onBack={closeBook}
        onOpenLibrary={() =>
          openLibrary(
            summaryOrigin === 'suggestions' ? 'suggestions' : 'recommendations',
          )
        }
        onSelectBook={(book) => openBook(book, summaryOrigin)}
      />
    );
  }

  if (screen === 'library') {
    return (
      <LibraryScreen
        onBack={() => setScreen(libraryOrigin)}
        onSelectBook={(book) => openBook(book, 'library')}
      />
    );
  }

  return (
    <RecommendationsScreen
      interests={interests}
      hasSuggestions={suggestions.length > 0}
      onReset={() => void handleResetInterests()}
      onBackToKey={() => setScreen('home')}
      onOpenLibrary={() => openLibrary('recommendations')}
      onContinue={(books) => {
        if (books) {
          setSuggestions(books);
          void saveSuggestions(books);
          void clearLastBook();
        }
        setScreen('suggestions');
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
