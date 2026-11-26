import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import BookSummaryScreen from './src/screens/BookSummaryScreen';
import HomeScreen from './src/screens/HomeScreen';
import InterestsScreen from './src/screens/InterestsScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';
import SearchScreen from './src/screens/SearchScreen';
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
  | 'library'
  | 'search';

type LibraryOrigin = 'suggestions' | 'recommendations' | 'search';
type SummaryOrigin = 'suggestions' | 'library' | 'search';
type SearchOrigin = 'suggestions' | 'recommendations' | 'library';
type InterestsOrigin = 'home' | 'recommendations';

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
  const [interestsOrigin, setInterestsOrigin] =
    useState<InterestsOrigin>('home');
  const [searchOrigin, setSearchOrigin] = useState<SearchOrigin>('recommendations');
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
    setInterestsOrigin('recommendations');
    setScreen('interests');
  };

  const openLibrary = (from: LibraryOrigin) => {
    setLibraryOrigin(from);
    setScreen('library');
  };

  const openSearch = (from: SearchOrigin) => {
    setSearchOrigin(from);
    setScreen('search');
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
    setScreen(
      summaryOrigin === 'library'
        ? 'library'
        : summaryOrigin === 'search'
          ? 'search'
          : 'suggestions',
    );
  };

  const goBack = (): boolean => {
    if (!isReady) {
      return true;
    }

    switch (screen) {
      case 'bookSummary':
        if (selectedBook) {
          closeBook();
        } else {
          setScreen('suggestions');
        }
        return true;
      case 'library':
        setScreen(libraryOrigin);
        return true;
      case 'suggestions':
        setScreen('recommendations');
        return true;
      case 'interests':
        setScreen(interestsOrigin);
        return true;
      case 'search':
        setScreen(searchOrigin);
        return true;
      case 'recommendations':
        // La pantalla de clave es la anterior en el flujo.
        setScreen('home');
        return true;
      case 'home':
        // En la pantalla inicial dejamos que Android cierre la app.
        return false;
    }
  };

  // Se registra una sola vez al montar App. Así, los listeners que registren
  // las pantallas para cerrar sus modales se ejecutan primero (RN los llama en
  // orden inverso de registro) y pueden consumir el evento.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => goBackRef.current(),
    );

    return () => subscription.remove();
  }, []);

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
          setSearchOrigin('recommendations');
          setInterestsOrigin('home');

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
          setSearchOrigin('recommendations');

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
        onOpenSearch={() => openSearch('suggestions')}
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
            : summaryOrigin === 'search'
              ? 'Volver a la búsqueda'
              : 'Volver a sugerencias'
        }
        onBack={closeBook}
        onOpenLibrary={() =>
          openLibrary(summaryOrigin === 'library' ? 'recommendations' : summaryOrigin)
        }
        onSelectBook={(book) => openBook(book, summaryOrigin)}
      />
    );
  }

  if (screen === 'library') {
    return (
      <LibraryScreen
        onBack={() => setScreen(libraryOrigin)}
        onOpenSearch={() => openSearch('library')}
        onSelectBook={(book) => openBook(book, 'library')}
      />
    );
  }

  if (screen === 'search') {
    return (
      <SearchScreen
        onBack={() => setScreen(searchOrigin)}
        onOpenLibrary={() => openLibrary('search')}
        onSelectBook={(book) => openBook(book, 'search')}
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
      onOpenSearch={() => openSearch('recommendations')}
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
