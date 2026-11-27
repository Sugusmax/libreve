import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import BookSummaryScreen from './src/screens/BookSummaryScreen';
import HomeScreen from './src/screens/HomeScreen';
import InterestsScreen from './src/screens/InterestsScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import RecommendationsScreen from './src/screens/RecommendationsScreen';
import SearchScreen from './src/screens/SearchScreen';
import SuggestionsScreen from './src/screens/SuggestionsScreen';
import { initializeAds, showBookAd } from './src/services/ads';
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
import { ThemeProvider, useAppTheme } from './src/theme/AppTheme';

type Route =
  | { name: 'home' }
  | { name: 'interests' }
  | { name: 'recommendations' }
  | { name: 'suggestions' }
  | { name: 'bookSummary'; book: BookSuggestion }
  | { name: 'library' }
  | { name: 'search' };

function sameInterests(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function getRestoredStack(
  savedApiKey: string,
  completed: boolean,
  savedSuggestions: BookSuggestion[],
  savedBook: BookSuggestion | null,
): Route[] {
  const stack: Route[] = [{ name: 'home' }];

  if (!savedApiKey) {
    return stack;
  }

  if (!completed) {
    return [...stack, { name: 'interests' }];
  }

  stack.push({ name: 'recommendations' });

  if (savedSuggestions.length > 0) {
    stack.push({ name: 'suggestions' });

    if (savedBook && savedSuggestions.some((book) => booksMatch(book, savedBook))) {
      stack.push({ name: 'bookSummary', book: savedBook });
    }
  }

  return stack;
}

function getBackLabel(previous: Route | undefined): string {
  switch (previous?.name) {
    case 'library':
      return 'Volver a la biblioteca';
    case 'search':
      return 'Volver a la búsqueda';
    case 'bookSummary':
      return 'Volver al libro anterior';
    case 'suggestions':
      return 'Volver a sugerencias';
    default:
      return 'Volver';
  }
}

function AppContent() {
  const { colors, ready: themeReady } = useAppTheme();

  // Pila de navegación: «atrás» siempre vuelve a la ruta que empujó la actual.
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [apiKey, setApiKey] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [interestsCompleted, setInterestsCompleted] = useState(false);

  const route = stack[stack.length - 1];
  const screen = route.name;

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
        }

        setStack(
          getRestoredStack(
            apiKey ?? '',
            completed,
            savedSuggestions,
            savedBook,
          ),
        );
      } catch {
        if (active) {
          setStack([{ name: 'home' }]);
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

  const push = (next: Route) => {
    setStack((current) => [...current, next]);

    if (next.name === 'bookSummary') {
      void saveLastBook(next.book);
    } else {
      void clearLastBook();
    }
  };

  const pop = (): boolean => {
    if (!isReady || stack.length <= 1) {
      return false;
    }

    const previous = stack[stack.length - 2];
    setStack(stack.slice(0, -1));

    if (previous.name === 'bookSummary') {
      void saveLastBook(previous.book);
    } else {
      void clearLastBook();
    }

    return true;
  };

  const goHome = () => {
    setStack([{ name: 'home' }]);
    void clearLastBook();
  };

  const returnToRecommendations = (books: BookSuggestion[]) => {
    const next: Route[] = [{ name: 'home' }, { name: 'recommendations' }];

    if (books.length > 0) {
      next.push({ name: 'suggestions' });
    }

    setStack(next);
    void clearLastBook();
  };

  const adBusyRef = useRef(false);

  const openBook = (book: BookSuggestion) => {
    if (adBusyRef.current) {
      return;
    }

    adBusyRef.current = true;

    void showBookAd()
      .catch(() => undefined)
      .finally(() => {
        adBusyRef.current = false;
        push({ name: 'bookSummary', book });
      });
  };

  // Se registra una sola vez al montar App. Así, los listeners que registren
  // las pantallas para cerrar sus modales se ejecutan primero (RN los llama en
  // orden inverso de registro) y pueden consumir el evento.
  const popRef = useRef(pop);
  popRef.current = pop;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => popRef.current(),
    );

    void initializeAds();

    return () => subscription.remove();
  }, []);

  if (!isReady || !themeReady) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
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

          if (!interestsCompleted) {
            setStack([{ name: 'home' }, { name: 'interests' }]);
            return;
          }

          // Cambiar de clave no cambia los intereses: reutilizamos las
          // sugerencias guardadas para no gastar peticiones nuevas.
          returnToRecommendations(suggestions);
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

          if (changed) {
            setSuggestions([]);
            void clearSuggestions();
          }

          returnToRecommendations(changed ? [] : suggestions);
        }}
      />
    );
  }

  if (screen === 'suggestions') {
    return (
      <SuggestionsScreen
        books={suggestions}
        onBack={pop}
        onOpenLibrary={() => push({ name: 'library' })}
        onOpenSearch={() => push({ name: 'search' })}
        onSelectBook={openBook}
      />
    );
  }

  if (screen === 'bookSummary' && route.name === 'bookSummary') {
    return (
      <BookSummaryScreen
        key={`${route.book.title}|${route.book.author}`}
        book={route.book}
        backLabel={getBackLabel(stack[stack.length - 2])}
        onBack={pop}
        onOpenLibrary={() => push({ name: 'library' })}
        onSelectBook={openBook}
      />
    );
  }

  if (screen === 'library') {
    return (
      <LibraryScreen
        onBack={pop}
        onOpenSearch={() => push({ name: 'search' })}
        onSelectBook={openBook}
      />
    );
  }

  if (screen === 'search') {
    return (
      <SearchScreen
        onBack={pop}
        onOpenLibrary={() => push({ name: 'library' })}
        onSelectBook={openBook}
      />
    );
  }

  return (
    <RecommendationsScreen
      interests={interests}
      hasSuggestions={suggestions.length > 0}
      onReset={() => push({ name: 'interests' })}
      onBackToKey={goHome}
      onOpenLibrary={() => push({ name: 'library' })}
      onOpenSearch={() => push({ name: 'search' })}
      onContinue={(books) => {
        if (books) {
          setSuggestions(books);
          void saveSuggestions(books);
          void clearLastBook();
        }

        push({ name: 'suggestions' });
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
