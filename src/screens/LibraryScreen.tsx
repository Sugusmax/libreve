import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import PrimaryButton from '../components/PrimaryButton';
import type { BookSuggestion } from '../services/ai';
import {
  booksMatch,
  deleteBookSummary,
  loadLibrary,
  type LibraryEntry,
} from '../services/library';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type LibraryScreenProps = {
  onBack: () => void;
  onOpenSearch: () => void;
  onSelectBook: (book: BookSuggestion) => void;
};

type SortField = 'recent' | 'chapters' | 'author' | 'title' | 'reads';
type SortDirection = 'asc' | 'desc';
type SortMode = { field: SortField; direction: SortDirection };

const SORT_FIELDS: { id: SortField; label: string }[] = [
  { id: 'recent', label: 'Recientes' },
  { id: 'chapters', label: 'Capítulos resumidos' },
  { id: 'author', label: 'Alfabético - Autor' },
  { id: 'title', label: 'Alfabético - Título' },
  { id: 'reads', label: 'Lecturas' },
];

const DIRECTIONS: { id: SortDirection; label: string; arrow: string }[] = [
  { id: 'asc', label: 'Ascendente', arrow: '↑' },
  { id: 'desc', label: 'Descendente', arrow: '↓' },
];

export default function LibraryScreen({
  onBack,
  onOpenSearch,
  onSelectBook,
}: LibraryScreenProps) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>({
    field: 'chapters',
    direction: 'desc',
  });
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LibraryEntry | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const saved = await loadLibrary();

        if (active) {
          setEntries(saved);
        }
      } catch {
        if (active) {
          setStatus('No se pudo cargar tu biblioteca.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // «Atrás» cierra primero la confirmación o la hoja de orden; si no hay
  // ninguna abierta, App.tsx se encarga de volver a la pantalla anterior.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (pendingDelete) {
          setPendingDelete(null);
          return true;
        }

        if (sortSheetVisible) {
          setSortSheetVisible(false);
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [pendingDelete, sortSheetVisible]);

  const sortedEntries = useMemo(() => {
    const items = [...entries];
    const compareText = (a: string, b: string) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' });

    const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
      compareText(a.book.title, b.book.title);

    const sign = sortMode.direction === 'asc' ? 1 : -1;
    const primary = (a: LibraryEntry, b: LibraryEntry): number => {
      switch (sortMode.field) {
        case 'recent':
          return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        case 'chapters':
          return a.chapters.length - b.chapters.length;
        case 'author':
          return compareText(a.book.author, b.book.author);
        case 'title':
          return compareText(a.book.title, b.book.title);
        case 'reads':
          return (a.readCount ?? 0) - (b.readCount ?? 0);
      }
    };

    return items.sort(
      (a, b) => sign * primary(a, b) || byTitle(a, b),
    );
  }, [entries, sortMode]);

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    const target = pendingDelete;
    setPendingDelete(null);
    setStatus('');

    try {
      await deleteBookSummary(target.book);
      setEntries((current) =>
        current.filter((entry) => !booksMatch(entry.book, target.book)),
      );
      setStatus(`Se borró «${target.book.title}».`);
    } catch {
      setStatus('No se pudo borrar el resumen. Vuelve a intentarlo.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>TUS LECTURAS GUARDADAS</Text>
          <Text style={styles.title}>Mi biblioteca</Text>
          <Text style={styles.description}>
            Aquí están los libros que ya resumiste. Puedes releerlos cuando
            quieras sin gastar peticiones nuevas a la IA.
          </Text>

          {isLoading ? <ActivityIndicator color={colors.primary} /> : null}

          {!isLoading && entries.length === 0 ? (
            <Text style={styles.empty}>
              Todavía no hay resúmenes guardados. Elige un libro en tus
              sugerencias y genera el primer capítulo.
            </Text>
          ) : null}

          {entries.length > 1 ? (
            <TouchableOpacity
              style={styles.sortBar}
              onPress={() => setSortSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Cambiar orden de la biblioteca"
            >
              <View>
                <Text style={styles.sortLabel}>ORDENAR POR</Text>
                <Text style={styles.sortValue}>
                  {SORT_FIELDS.find((field) => field.id === sortMode.field)
                    ?.label}{' '}
                  {
                    DIRECTIONS.find(
                      (direction) => direction.id === sortMode.direction,
                    )?.arrow
                  }
                </Text>
              </View>
              <Text style={styles.sortChevron}>⌄</Text>
            </TouchableOpacity>
          ) : null}

          {sortedEntries.map((entry) => (
            <View
              key={`${entry.book.title}-${entry.book.author}`}
              style={styles.bookRow}
            >
              <TouchableOpacity
                style={styles.bookMain}
                onPress={() => onSelectBook(entry.book)}
                accessibilityRole="button"
                accessibilityLabel={`Releer ${entry.book.title}`}
              >
                {entry.book.coverUrl ? (
                  <Image
                    source={{ uri: entry.book.coverUrl }}
                    style={styles.cover}
                    resizeMode="cover"
                    accessibilityLabel={`Portada de ${entry.book.title}`}
                  />
                ) : null}
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle}>{entry.book.title}</Text>
                  <Text style={styles.bookAuthor}>{entry.book.author}</Text>
                  <Text style={styles.chapterCount}>
                    {entry.book.totalChapters
                      ? `${entry.book.totalChapters} ${
                          entry.book.totalChapters === 1
                            ? 'capítulo'
                            : 'capítulos'
                        }`
                      : 'Número de capítulos desconocido'}
                  </Text>
                  <Text style={styles.savedCount}>
                    {entry.chapters.length}{' '}
                    {entry.chapters.length === 1 ? 'resumido' : 'resumidos'}
                  </Text>
                  <Text style={styles.readCount}>
                    {entry.readCount
                      ? `${entry.readCount} ${
                          entry.readCount === 1 ? 'lectura' : 'lecturas'
                        }`
                      : 'Sin lecturas registradas'}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => setPendingDelete(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Borrar resumen de ${entry.book.title}`}
              >
                <Text style={styles.deleteText}>Borrar</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Text style={styles.status}>{status}</Text>
          <TouchableOpacity onPress={onOpenSearch} accessibilityRole="button">
            <Text style={styles.link}>Buscar cualquier libro</Text>
          </TouchableOpacity>
          <PrimaryButton label="Volver" onPress={onBack} />
        </View>
      </ScrollView>

      <Modal
        visible={sortSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={styles.sheetOutside}
            activeOpacity={1}
            onPress={() => setSortSheetVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar opciones de orden"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ordenar biblioteca</Text>
            <View style={styles.directionRow}>
              {DIRECTIONS.map((direction) => {
                const isSelected = sortMode.direction === direction.id;

                return (
                  <TouchableOpacity
                    key={direction.id}
                    style={[
                      styles.directionButton,
                      isSelected && styles.directionButtonSelected,
                    ]}
                    onPress={() =>
                      setSortMode((current) => ({
                        ...current,
                        direction: direction.id,
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.directionButtonText,
                        isSelected && styles.directionButtonTextSelected,
                      ]}
                    >
                      {direction.label} {direction.arrow}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {SORT_FIELDS.map((option) => {
              const isSelected = sortMode.field === option.id;

              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.sheetOption,
                    isSelected && styles.sheetOptionSelected,
                  ]}
                  onPress={() =>
                    setSortMode((current) => ({
                      ...current,
                      field: option.id,
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      isSelected && styles.sheetOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected ? (
                    <Text style={styles.sheetCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Borrar este resumen?</Text>
            <Text style={styles.modalText}>
              Se borrarán los capítulos guardados de «{pendingDelete?.book.title}
              ». Para volver a leerlo habrá que generarlos de nuevo y gastar
              tokens.
            </Text>
            <PrimaryButton label="Borrar" onPress={() => void confirmDelete()} />
            <TouchableOpacity
              onPress={() => setPendingDelete(null)}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  empty: {
    color: colors.muted,
    fontSize: metrics.font.body,
    lineHeight: scale(20),
    textAlign: 'center',
  },
  sortBar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: metrics.spacing.md,
    paddingVertical: metrics.spacing.sm,
    borderRadius: metrics.radius.md,
    backgroundColor: colors.hint,
  },
  sortLabel: {
    color: colors.muted,
    fontSize: metrics.font.eyebrow,
    fontWeight: '700',
    letterSpacing: scale(1),
  },
  sortValue: {
    color: colors.primaryDark,
    fontSize: metrics.font.body,
    fontWeight: '700',
  },
  sortChevron: {
    color: colors.primary,
    fontSize: scale(22),
    fontWeight: '700',
    lineHeight: scale(24),
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38, 31, 50, 0.45)',
  },
  sheetOutside: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: metrics.radius.lg,
    borderTopRightRadius: metrics.radius.lg,
    paddingHorizontal: metrics.spacing.lg,
    paddingTop: metrics.spacing.sm,
    paddingBottom: metrics.spacing.xl,
    gap: metrics.spacing.xs,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: scale(40),
    height: scale(4),
    borderRadius: metrics.radius.pill,
    backgroundColor: colors.border,
    marginBottom: metrics.spacing.sm,
  },
  sheetTitle: {
    color: colors.primaryDark,
    fontSize: metrics.font.heading,
    fontWeight: '700',
    marginBottom: metrics.spacing.xs,
  },
  directionRow: {
    flexDirection: 'row',
    gap: metrics.spacing.xs,
    marginBottom: metrics.spacing.sm,
  },
  directionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: metrics.spacing.sm,
    borderRadius: metrics.radius.md,
    backgroundColor: colors.hint,
  },
  directionButtonSelected: {
    backgroundColor: colors.primary,
  },
  directionButtonText: {
    color: colors.muted,
    fontSize: metrics.font.body,
    fontWeight: '600',
  },
  directionButtonTextSelected: {
    color: colors.surface,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: metrics.spacing.sm,
    borderBottomWidth: scale(1),
    borderBottomColor: colors.border,
  },
  sheetOptionSelected: {
    borderBottomColor: colors.primary,
  },
  sheetOptionText: {
    color: colors.text,
    fontSize: metrics.font.body,
  },
  sheetOptionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  sheetCheck: {
    color: colors.primary,
    fontSize: metrics.font.heading,
    fontWeight: '700',
  },
  bookRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.spacing.xs,
    paddingBottom: metrics.spacing.sm,
    borderBottomWidth: scale(1),
    borderBottomColor: colors.border,
  },
  bookMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.spacing.sm,
  },
  cover: {
    width: scale(70),
    height: scale(105),
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
  chapterCount: {
    color: colors.accent,
    fontSize: metrics.font.body,
    fontWeight: '600',
  },
  savedCount: {
    color: colors.muted,
    fontSize: metrics.font.body,
  },
  readCount: {
    color: colors.muted,
    fontSize: metrics.font.body,
  },
  deleteButton: {
    paddingHorizontal: metrics.spacing.xs,
    paddingVertical: metrics.spacing.sm,
  },
  deleteText: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  status: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  link: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: metrics.spacing.lg,
  },
  modalCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: metrics.radius.lg,
    padding: metrics.spacing.lg,
    gap: metrics.spacing.md,
  },
  modalTitle: {
    color: colors.primaryDark,
    fontSize: metrics.font.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalText: {
    color: colors.muted,
    fontSize: metrics.font.body,
    lineHeight: scale(20),
    textAlign: 'center',
  },
  cancelText: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
