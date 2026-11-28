import { useMemo } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import type { BookSuggestion } from '../services/ai';
import { useAppTheme } from '../theme/AppTheme';
import { type Palette } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type SuggestionsScreenProps = {
  books: BookSuggestion[];
  status?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onBack: () => void;
  onOpenLibrary: () => void;
  onOpenSearch: () => void;
  onSelectBook: (book: BookSuggestion) => void;
};

export default function SuggestionsScreen({
  books,
  status = '',
  isRefreshing = false,
  onRefresh,
  onBack,
  onOpenLibrary,
  onOpenSearch,
  onSelectBook,
}: SuggestionsScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SELECCIÓN PARA TI</Text>
          <Text style={styles.title}>Sugerencias de lectura</Text>
          <Text style={styles.description}>
            Libros propuestos por la IA a partir de tus intereses.
          </Text>

          {books.map((book, index) => {
            const total = book.totalChapters;

            return (
              <View key={`${book.title}-${index}`} style={styles.bookRow}>
                <TouchableOpacity
                  onPress={() => onSelectBook(book)}
                  accessibilityRole="button"
                  accessibilityLabel={`Resumir ${book.title}`}
                >
                  <Image
                    source={{ uri: book.coverUrl }}
                    style={styles.cover}
                    resizeMode="cover"
                    accessibilityLabel={`Imagen de ${book.title}`}
                  />
                </TouchableOpacity>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle}>{book.title}</Text>
                  <Text style={styles.bookAuthor}>{book.author}</Text>
                  <Text style={styles.bookReason}>{book.reason}</Text>
                  <Text style={styles.chapterCount}>
                    {total
                      ? `${total} ${total === 1 ? 'capítulo' : 'capítulos'}`
                      : 'Número de capítulos desconocido'}
                  </Text>
                </View>
              </View>
            );
          })}

          {status ? <Text style={styles.status}>{status}</Text> : null}
          <PrimaryButton
            colors={colors}
            label="Más sugerencias"
            onPress={() => onRefresh?.()}
            disabled={isRefreshing || !onRefresh}
          />

          <TouchableOpacity
            onPress={() => void Linking.openURL('https://openlibrary.org/')}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Portadas cortesía de Open Library</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSearch} accessibilityRole="button">
            <Text style={styles.link}>Buscar cualquier libro</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenLibrary} accessibilityRole="button">
            <Text style={styles.link}>Mi biblioteca</Text>
          </TouchableOpacity>
          <PrimaryButton colors={colors} label="Volver" onPress={onBack} />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
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
    status: {
      color: colors.muted,
      fontSize: metrics.font.body,
      lineHeight: scale(19),
      textAlign: 'center',
    },
    bookRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: metrics.spacing.sm,
      paddingBottom: metrics.spacing.sm,
      borderBottomWidth: scale(1),
      borderBottomColor: colors.border,
    },
    cover: {
      width: scale(90),
      height: scale(135),
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
    bookReason: {
      color: colors.muted,
      fontSize: metrics.font.body,
      lineHeight: scale(19),
    },
    chapterCount: {
      color: colors.accent,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    link: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
}
