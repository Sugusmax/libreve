import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  findNodeHandle,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import ApiKeyField from '../components/ApiKeyField';
import ApiKeyHelp from '../components/ApiKeyHelp';
import BackLink from '../components/BackLink';
import PrimaryButton from '../components/PrimaryButton';
import WorkingIndicator from '../components/WorkingIndicator';
import { getProvider, providers, type ProviderId } from '../data/providers';
import {
  loadApiKey,
  loadProviderId,
  saveApiKey,
  saveProviderId,
} from '../services/apiKey';
import {
  fetchBookSummary,
  fetchSimilarBooks,
  type BookChapter,
  type BookSuggestion,
} from '../services/ai';
import { upgradeCoverUrl } from '../services/covers';
import {
  DEFAULT_READ_ALOUD_SETTINGS,
  READ_ALOUD_LIMITS,
  loadReadAloud,
  loadReadAloudSettings,
  readText,
  saveReadAloud,
  saveReadAloudSettings,
  stopReading,
  type ReadAloudSettings,
} from '../services/readAloud';
import {
  booksMatch,
  loadChapters,
  loadLibrary,
  loadSimilarBooks,
  recordBookRead,
  saveChapters,
  saveSimilarBooks,
} from '../services/library';
import {
  getSystemScheme,
  loadTheme,
  saveTheme,
  subscribeToSystemScheme,
  type ColorScheme,
} from '../services/theme';
import {
  DEFAULT_SUMMARY_STYLE,
  SUMMARY_FONT_IDS,
  SUMMARY_FONTS,
  SUMMARY_FONT_SIZE_LIMITS,
  loadSummaryStyle,
  saveSummaryStyle,
  type SummaryFontId,
  type SummaryStyleSettings,
} from '../services/summaryStyle';
import { resolveColors, type Palette, type ThemeMode } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type BookSummaryScreenProps = {
  book: BookSuggestion;
  backLabel: string;
  onBack: () => void;
  onOpenLibrary: () => void;
  onSelectBook: (book: BookSuggestion) => void;
};

type ChapterDraft = {
  number: number;
  title: string;
  summary: string;
  isLast?: boolean;
};

type ModelPicker = {
  chapter: BookChapter;
  saved: ProviderId[];
  active: ProviderId;
};

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto'];
const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  light: { icon: '☀', label: 'Claro' },
  dark: { icon: '☾', label: 'Oscuro' },
  auto: { icon: '◐', label: 'Auto' },
};

function splitIntoParagraphs(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  // Si la IA no separó párrafos, agrupamos las frases de dos en dos.
  const sentences =
    normalized.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ??
    [];

  if (sentences.length < 3) {
    return lines;
  }

  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(' '));
  }

  return paragraphs;
}

export default function BookSummaryScreen({
  book,
  backLabel,
  onBack,
  onOpenLibrary,
  onSelectBook,
}: BookSummaryScreenProps) {
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<ChapterDraft | null>(null);
  const [coverVisible, setCoverVisible] = useState(false);
  const [largeCoverFailed, setLargeCoverFailed] = useState(false);
  const [similarBooks, setSimilarBooks] = useState<BookSuggestion[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [menuChapter, setMenuChapter] = useState<BookChapter | null>(null);
  const [modelPicker, setModelPicker] = useState<ModelPicker | null>(null);
  const [addingKey, setAddingKey] = useState(false);
  const [newProviderId, setNewProviderId] = useState<ProviderId>('gemini');
  const [newKey, setNewKey] = useState('');
  const [keyStatus, setKeyStatus] = useState('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemScheme);
  const [readAloud, setReadAloud] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<ReadAloudSettings>(
    DEFAULT_READ_ALOUD_SETTINGS,
  );
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyleSettings>(
    DEFAULT_SUMMARY_STYLE,
  );
  const [speakingChapter, setSpeakingChapter] = useState<number | null>(null);
  const [highlightedChapter, setHighlightedChapter] = useState<number | null>(
    null,
  );
  const highlightRef = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const chapterRefs = useRef<Record<number, View | null>>({});
  const shouldScrollRef = useRef(false);
  const pendingFocusRef = useRef<number | null>(null);
  const userScrolledRef = useRef(false);
  const similarRequestedRef = useRef(false);
  const lastOffsetRef = useRef(0);
  const speechTokenRef = useRef(0);

  useEffect(() => {
    let active = true;

    void loadTheme()
      .then((mode) => {
        if (active) {
          setThemeMode(mode);
        }
      })
      .catch(() => undefined);

    void loadReadAloud()
      .then((enabled) => {
        if (active) {
          setReadAloud(enabled);
        }
      })
      .catch(() => undefined);

    void loadReadAloudSettings()
      .then((settings) => {
        if (active) {
          setVoiceSettings(settings);
        }
      })
      .catch(() => undefined);

    void loadSummaryStyle()
      .then((settings) => {
        if (active) {
          setSummaryStyle(settings);
        }
      })
      .catch(() => undefined);

    const unsubscribe = subscribeToSystemScheme(setSystemScheme);

    return () => {
      active = false;
      unsubscribe();
      speechTokenRef.current += 1;
      void stopReading();
    };
  }, []);

  // El botón/gesto «atrás» cierra primero el diálogo abierto; si no hay
  // ninguno, el evento llega a App.tsx y vuelve a la pantalla anterior.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (modelPicker) {
          if (addingKey) {
            setAddingKey(false);
            setKeyStatus('');
          } else {
            setModelPicker(null);
          }
          return true;
        }

        if (menuChapter) {
          setMenuChapter(null);
          return true;
        }

        if (coverVisible) {
          setCoverVisible(false);
          return true;
        }

        if (settingsVisible) {
          setSettingsVisible(false);
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [
    modelPicker,
    addingKey,
    menuChapter,
    coverVisible,
    settingsVisible,
  ]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;

    // Durante la generación no desplazamos la vista nosotros: cualquier
    // movimiento real del scroll es una decisión del usuario.
    if (
      (isLoading || isRestoring || draft) &&
      Math.abs(offset - lastOffsetRef.current) > 2
    ) {
      userScrolledRef.current = true;
    }

    lastOffsetRef.current = offset;
  };

  const loadSimilar = async (silent = false) => {
    if (similarRequestedRef.current) {
      return;
    }

    similarRequestedRef.current = true;
    setIsLoadingSimilar(true);

    if (!silent) {
      setStatus('');
    }

    try {
      const [saved, library] = await Promise.all([
        loadSimilarBooks(book),
        loadLibrary(),
      ]);
      const alreadyRead = [book, ...library.map((entry) => entry.book)];
      const onlyUnread = (books: BookSuggestion[]) =>
        books.filter(
          (item) =>
            !alreadyRead.some((read) => booksMatch(item, read)),
        );

      const usableSaved = onlyUnread(saved);

      // Si guardamos sugerencias antes de leer alguno de esos títulos, las
      // renovamos para priorizar libros que el usuario aún no tiene en la
      // biblioteca.
      if (usableSaved.length > 0 && usableSaved.length === saved.length) {
        setSimilarBooks(usableSaved);
        return;
      }

      const books = onlyUnread(
        await fetchSimilarBooks(book, setStatus, alreadyRead),
      );

      if (books.length === 0) {
        throw new Error('La IA no devolvió títulos nuevos para recomendar.');
      }

      setSimilarBooks(books);

      try {
        await saveSimilarBooks(book, books);
      } catch {
        // Las sugerencias siguen disponibles en esta sesión.
      }
    } catch (error) {
      similarRequestedRef.current = false;

      if (!silent) {
        setStatus(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar títulos similares.',
        );
      }
    } finally {
      setIsLoadingSimilar(false);
    }
  };

  // Solo para depuración: permite ver el bloque de fin de libro sin esperar a
  // que la IA marque is_last en el último capítulo real.
  const toggleSimulatedEnd = async () => {
    if (isLoading || chapters.length === 0) {
      return;
    }

    const lastNumber = chapters[chapters.length - 1].number;
    const updated = chapters.map((chapter) =>
      chapter.number === lastNumber
        ? { ...chapter, isLast: !isFinished }
        : chapter,
    );

    setStatus('');
    setChapters(updated);

    try {
      await saveChapters(book, updated);
    } catch {
      // El cambio sigue activo en esta sesión.
    }

    if (isFinished) {
      similarRequestedRef.current = false;
    } else {
      await loadSimilar();
    }
  };

  const loadNextChapter = async () => {
    if (isLoading) {
      return;
    }

    const number = chapters.length + 1;

    userScrolledRef.current = false;
    setIsLoading(true);
    setStatus('');
    setDraft({ number, title: '', summary: '' });

    try {
      const chapter = await fetchBookSummary(
        book,
        chapters,
        setStatus,
        undefined,
        ({ title, summary, isLast }) => {
          setDraft({ number, title, summary, isLast });

          // En cuanto la IA marca el final, empezamos a buscar recomendaciones
          // mientras el último capítulo sigue escribiéndose en pantalla.
          if (isLast && !similarRequestedRef.current) {
            void loadSimilar(true);
          }
        },
      );
      const updated = [...chapters, chapter];

      setStatus('');
      setDraft(null);
      setChapters(updated);
      shouldScrollRef.current = true;

      try {
        await saveChapters(book, updated);
      } catch {
        // Si no se puede guardar, el resumen sigue disponible en esta sesión.
      }

      if (chapter.isLast) {
        await loadSimilar();
      }
    } catch (error) {
      setDraft(null);
      setStatus(
        error instanceof Error
          ? error.message
          : 'No se pudo resumir el capítulo.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateChapter = async (chapter: BookChapter) => {
    if (isLoading) {
      return;
    }

    const target = chapter.number;
    setMenuChapter(null);
    userScrolledRef.current = false;
    setIsLoading(true);
    setStatus('');
    setDraft({ number: target, title: '', summary: '' });

    try {
      const before = chapters.filter((chapter) => chapter.number < target);
      const chapter = await fetchBookSummary(
        book,
        before,
        setStatus,
        target,
        ({ title, summary, isLast }) => {
          setDraft({ number: target, title, summary, isLast });

          if (isLast && !similarRequestedRef.current) {
            void loadSimilar(true);
          }
        },
      );
      const updated = chapters
        .map((current) => (current.number === target ? chapter : current))
        .sort((a, b) => a.number - b.number);

      setStatus('');
      setDraft(null);
      setChapters(updated);
      pendingFocusRef.current = target;

      try {
        await saveChapters(book, updated);
      } catch {
        // El resumen sigue disponible en esta sesión.
      }
    } catch (error) {
      setDraft(null);
      setStatus(
        error instanceof Error
          ? error.message
          : 'No se pudo resumir el capítulo.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const openModelPicker = async (chapter: BookChapter) => {
    if (isLoading) {
      return;
    }

    setAddingKey(false);
    setNewKey('');
    setKeyStatus('');

    try {
      const [savedKeys, active] = await Promise.all([
        Promise.all(
          providers.map(async (provider) =>
            (await loadApiKey(provider.id)) ? provider.id : null,
          ),
        ),
        loadProviderId(),
      ]);

      setModelPicker({
        chapter,
        saved: savedKeys.filter((id): id is ProviderId => id !== null),
        active,
      });
      setMenuChapter(null);
    } catch {
      setStatus('No se pudieron leer las claves guardadas.');
    }
  };

  const regenerateWithSavedKey = async (id: ProviderId) => {
    if (!modelPicker || isLoading) {
      return;
    }

    const chapter = modelPicker.chapter;

    try {
      await saveProviderId(id);
    } catch {
      setKeyStatus('No se pudo activar esa clave.');
      return;
    }

    setModelPicker(null);
    await regenerateChapter(chapter);
  };

  const regenerateWithNewKey = async () => {
    if (!modelPicker || isLoading) {
      return;
    }

    const key = newKey.trim();

    if (!key) {
      setKeyStatus('Ingresa una clave antes de continuar.');
      return;
    }

    const chapter = modelPicker.chapter;

    try {
      await saveApiKey(key, newProviderId);
    } catch (error) {
      setKeyStatus(
        error instanceof Error ? error.message : 'No se pudo guardar la clave.',
      );
      return;
    }

    setModelPicker(null);
    await regenerateChapter(chapter);
  };

  const pasteNewKey = async () => {
    try {
      const copied = (await Clipboard.getStringAsync()).trim();

      if (!copied) {
        setKeyStatus('No hay una clave copiada en el portapapeles.');
        return;
      }

      setNewKey(copied);
      setKeyStatus('');
    } catch {
      setKeyStatus('No se pudo leer el portapapeles.');
    }
  };

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;

    (async () => {
      try {
        const saved = await loadChapters(book);

        if (saved.length > 0) {
          setChapters(saved);
          shouldScrollRef.current = true;
          setIsRestoring(false);
          void recordBookRead(book).catch(() => {
            // El contador es orientativo: no bloqueamos la lectura si falla.
          });

          if (saved.some((chapter) => chapter.isLast)) {
            void loadSimilar();
          }

          return;
        }
      } catch {
        // No hay resúmenes guardados: generamos el primero.
      }

      setIsRestoring(false);
      void loadNextChapter();
    })();
  }, []);

  const focusRegeneratedChapter = (number: number) => {
    highlightRef.stopAnimation();
    highlightRef.setValue(0);
    setHighlightedChapter(number);

    // Dos pulsos suaves sobre el capítulo reemplazado para que se note dónde
    // está la versión nueva.
    Animated.loop(
      Animated.sequence([
        Animated.timing(highlightRef, {
          toValue: 1,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(highlightRef, {
          toValue: 0,
          duration: 620,
          useNativeDriver: false,
        }),
      ]),
      { iterations: 2 },
    ).start(({ finished }) => {
      if (finished) {
        setHighlightedChapter(null);
      }
    });

    const target = chapterRefs.current[number];
    const scroller = scrollRef.current;
    const scrollerNode = scroller ? findNodeHandle(scroller) : null;

    if (target && scroller && scrollerNode !== null) {
      target.measureLayout(
        scrollerNode,
        (_x, y) => {
          scroller.scrollTo({ y: Math.max(0, y - scale(24)), animated: true });
        },
        () => {},
      );
    }
  };

  useEffect(() => {
    const focusNumber = pendingFocusRef.current;

    if (focusNumber !== null) {
      pendingFocusRef.current = null;
      requestAnimationFrame(() => focusRegeneratedChapter(focusNumber));
      return;
    }

    if (!shouldScrollRef.current) {
      return;
    }

    shouldScrollRef.current = false;

    if (userScrolledRef.current) {
      return;
    }

    scrollRef.current?.scrollToEnd({ animated: true });
  }, [chapters]);

  const isFinished = chapters.some((chapter) => chapter.isLast);
  const isFinishing = isFinished || Boolean(draft?.isLast);
  // Los capítulos guardados no cambian mientras llega el stream: calcular sus
  // párrafos una sola vez evita reordenar texto en cada actualización.
  const savedParagraphs = useMemo(
    () => chapters.map((chapter) => splitIntoParagraphs(chapter.summary)),
    [chapters],
  );
  const showWorking =
    isRestoring || isLoading || (isLoadingSimilar && similarBooks.length === 0);
  const largeCover =
    book.coverLargeUrl ?? upgradeCoverUrl(book.coverUrl) ?? book.coverUrl;
  const activeScheme: ColorScheme =
    themeMode === 'auto' ? systemScheme : themeMode;
  const colors = useMemo(() => resolveColors(activeScheme), [activeScheme]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const summaryTextStyle = useMemo(
    () => ({
      fontFamily: SUMMARY_FONTS[summaryStyle.font].fontFamily,
      fontSize: scale(summaryStyle.fontSize),
      lineHeight: Math.round(scale(summaryStyle.fontSize) * 1.45),
    }),
    [summaryStyle.font, summaryStyle.fontSize],
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.style.setProperty('--libreve-bg', colors.background);

    return () => {
      document.documentElement.style.removeProperty('--libreve-bg');
    };
  }, [colors.background]);

  const stopChapterReading = () => {
    speechTokenRef.current += 1;
    void stopReading();
    setSpeakingChapter(null);
  };

  const toggleReadAloud = () => {
    const enabled = !readAloud;

    setReadAloud(enabled);
    void saveReadAloud(enabled);

    if (!enabled) {
      stopChapterReading();
    }
  };

  const updateVoiceSetting = (
    key: keyof ReadAloudSettings,
    direction: -1 | 1,
  ) => {
    stopChapterReading();

    setVoiceSettings((current) => {
      const limit = READ_ALOUD_LIMITS[key];
      const changed =
        Math.round((current[key] + direction * limit.step) * 10) / 10;
      const next = {
        ...current,
        [key]: Math.min(limit.max, Math.max(limit.min, changed)),
      };

      void saveReadAloudSettings(next);
      return next;
    });
  };

  const resetVoiceSettings = () => {
    stopChapterReading();
    setVoiceSettings(DEFAULT_READ_ALOUD_SETTINGS);
    void saveReadAloudSettings(DEFAULT_READ_ALOUD_SETTINGS);
  };

  const selectSummaryFont = (font: SummaryFontId) => {
    setSummaryStyle((current) => {
      const next = { ...current, font };
      void saveSummaryStyle(next);
      return next;
    });
  };

  const updateSummaryFontSize = (direction: -1 | 1) => {
    setSummaryStyle((current) => {
      const changed = current.fontSize + direction * SUMMARY_FONT_SIZE_LIMITS.step;
      const next = {
        ...current,
        fontSize: Math.min(
          SUMMARY_FONT_SIZE_LIMITS.max,
          Math.max(SUMMARY_FONT_SIZE_LIMITS.min, changed),
        ),
      };

      void saveSummaryStyle(next);
      return next;
    });
  };

  const resetSummaryStyle = () => {
    setSummaryStyle(DEFAULT_SUMMARY_STYLE);
    void saveSummaryStyle(DEFAULT_SUMMARY_STYLE);
  };

  const resetAllSettings = () => {
    resetVoiceSettings();
    resetSummaryStyle();
  };

  const renderVoiceSettingRow = (
    key: keyof ReadAloudSettings,
    label: string,
    valueText: string,
  ) => (
    <View style={styles.voiceSettingRow} key={key}>
      <Text style={styles.voiceSettingLabel}>{label}</Text>
      <View style={styles.voiceStepper}>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => updateVoiceSetting(key, -1)}
          accessibilityRole="button"
          accessibilityLabel={`Reducir ${label}`}
        >
          <Text style={styles.stepText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.voiceSettingValue}>{valueText}</Text>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => updateVoiceSetting(key, 1)}
          accessibilityRole="button"
          accessibilityLabel={`Aumentar ${label}`}
        >
          <Text style={styles.stepText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const toggleChapterReading = (chapter: BookChapter) => {
    if (speakingChapter === chapter.number) {
      stopChapterReading();
      return;
    }

    speechTokenRef.current += 1;
    const token = speechTokenRef.current;
    setSpeakingChapter(chapter.number);

    readText(splitIntoParagraphs(chapter.summary).join('\n'), {
      isCancelled: () => speechTokenRef.current !== token,
      onDone: () => {
        if (speechTokenRef.current === token) {
          setSpeakingChapter(null);
        }
      },
      onError: () => {
        if (speechTokenRef.current === token) {
          setSpeakingChapter(null);
        }
      },
    }, voiceSettings);
  };

  const chapterHighlightStyle = {
    backgroundColor: highlightRef.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.hint, colors.accent],
    }),
    borderColor: highlightRef.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.border, colors.accent],
    }),
    borderWidth: scale(1),
  };

  return (
    <View style={styles.container}>
      <StatusBar style={activeScheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.eyebrow}>RESUMEN POR CAPÍTULOS</Text>
          </View>

          <View style={styles.bookHeader}>
            {book.coverUrl ? (
              <TouchableOpacity
                onPress={() => {
                  setLargeCoverFailed(false);
                  setCoverVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Ampliar portada de ${book.title}`}
              >
                <Image
                  source={{ uri: book.coverUrl }}
                  style={styles.cover}
                  resizeMode="cover"
                  accessibilityLabel={`Portada de ${book.title}`}
                />
              </TouchableOpacity>
            ) : null}
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle}>{book.title}</Text>
              <Text style={styles.bookAuthor}>{book.author}</Text>
              <Text style={styles.chapterMeta}>
                {book.totalChapters
                  ? `${book.totalChapters} ${
                      book.totalChapters === 1 ? 'capítulo' : 'capítulos'
                    }${isFinished ? ' · Completado' : ''}`
                  : 'Número de capítulos desconocido'}
              </Text>
            </View>
          </View>

          {chapters.map((chapter, index) => (
            <Animated.View
              key={chapter.number}
              ref={(node) => {
                chapterRefs.current[chapter.number] = node as View | null;
              }}
              style={[
                styles.chapter,
                highlightedChapter === chapter.number
                  ? chapterHighlightStyle
                  : null,
              ]}
            >
              <View style={styles.chapterHeader}>
                <TouchableOpacity
                  style={styles.chapterHeadingButton}
                  onPress={() => setMenuChapter(chapter)}
                  accessibilityRole="button"
                  accessibilityLabel={`Opciones del capítulo ${chapter.number}`}
                >
                  <Text style={styles.chapterHeading}>
                    Capítulo {chapter.number} · {chapter.title}
                  </Text>
                </TouchableOpacity>
                {readAloud ? (
                  <TouchableOpacity
                    style={styles.speakButton}
                    hitSlop={scale(6)}
                    onPress={() => toggleChapterReading(chapter)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      speakingChapter === chapter.number
                        ? `Detener lectura del capítulo ${chapter.number}`
                        : `Leer capítulo ${chapter.number} en voz alta`
                    }
                  >
                    <Text style={styles.speakIcon}>
                      {speakingChapter === chapter.number ? '■' : '▶'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.chapterBody}>
                {savedParagraphs[index].map((paragraph, paragraphIndex) => (
                  <Text
                    key={`${chapter.number}-${paragraphIndex}`}
                    style={[styles.chapterText, summaryTextStyle]}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </Animated.View>
          ))}

          {draft ? (
            <View style={[styles.chapter, styles.draft]}>
              <Text style={styles.draftHeading}>
                Capítulo {draft.number}
                {draft.title ? ` · ${draft.title}` : ''}
              </Text>
              <View style={styles.chapterBody}>
                {splitIntoParagraphs(draft.summary).map((paragraph, index) => (
                  <Text
                    key={index}
                    style={[styles.chapterText, summaryTextStyle]}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={styles.status}>{status}</Text>
          {/* Un único indicador para todo el flujo: al cambiar de rama no se
              desmonta, así que la animación nunca se reinicia a medias. */}
          {showWorking ? <WorkingIndicator colors={colors} /> : null}
          {!isRestoring && isFinishing ? (
            <>
              {similarBooks.length > 0 ? (
                <View style={styles.similar}>
                  <Text style={styles.similarHeading}>Títulos similares</Text>
                  {similarBooks.map((item, index) => (
                    <TouchableOpacity
                      key={`${item.title}-${index}`}
                      style={styles.similarItem}
                      onPress={() => onSelectBook(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir ${item.title}`}
                    >
                      {item.coverUrl ? (
                        <Image
                          source={{ uri: item.coverUrl }}
                          style={styles.similarCover}
                          resizeMode="cover"
                          accessibilityLabel={`Portada de ${item.title}`}
                        />
                      ) : null}
                      <View style={styles.similarInfo}>
                        <Text style={styles.similarTitle}>{item.title}</Text>
                        <Text style={styles.similarAuthor}>{item.author}</Text>
                        <Text style={styles.similarReason}>{item.reason}</Text>
                        {item.totalChapters ? (
                          <Text style={styles.similarChapters}>
                            {item.totalChapters}{' '}
                            {item.totalChapters === 1
                              ? 'capítulo'
                              : 'capítulos'}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : !isLoading && !isLoadingSimilar ? (
                <PrimaryButton colors={colors}
                  label="Reintentar sugerencias"
                  onPress={() => void loadSimilar()}
                />
              ) : null}
            </>
          ) : !isRestoring && !isLoading ? (
            <PrimaryButton colors={colors}
              label="Continuar"
              onPress={() => void loadNextChapter()}
            />
          ) : null}
          <BackLink colors={colors} label={backLabel} onPress={onBack} />
          <TouchableOpacity onPress={onOpenLibrary} accessibilityRole="button">
            <Text style={styles.link}>Mi biblioteca</Text>
          </TouchableOpacity>
          {typeof __DEV__ !== 'undefined' && __DEV__ && chapters.length > 0 ? (
            <TouchableOpacity
              onPress={() => void toggleSimulatedEnd()}
              accessibilityRole="button"
            >
              <Text style={styles.devLink}>
                {isFinished
                  ? 'Quitar fin simulado (dev)'
                  : 'Simular fin de libro (dev)'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.settingsButton}
        hitSlop={scale(8)}
        onPress={() => setSettingsVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Abrir ajustes del resumen"
      >
        <Text style={styles.settingsButtonIcon}>⚙</Text>
      </TouchableOpacity>

      {book.coverUrl ? (
        <Modal
          visible={coverVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCoverVisible(false)}
        >
          <TouchableOpacity
            style={styles.coverBackdrop}
            activeOpacity={1}
            onPress={() => setCoverVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar portada"
          >
            <Image
              source={{
                uri:
                  !largeCoverFailed && largeCover
                    ? largeCover
                    : book.coverUrl,
              }}
              style={styles.coverLarge}
              resizeMode="contain"
              onError={() => setLargeCoverFailed(true)}
              accessibilityLabel={`Portada de ${book.title}`}
            />
            <Text style={styles.coverHint}>Toca para cerrar</Text>
          </TouchableOpacity>
        </Modal>
      ) : null}

      <Modal
        visible={menuChapter !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuChapter(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuChapter(null)}
        >
          <TouchableOpacity style={styles.menu} activeOpacity={1}>
            <Text style={styles.menuTitle}>
              Capítulo {menuChapter?.number}
            </Text>
            <Text style={styles.menuSubtitle}>{menuChapter?.title}</Text>
            <Text style={styles.menuMeta}>
              IA: {menuChapter?.aiUsed ?? 'No registrada en este capítulo'}
            </Text>
            {isLoading ? (
              <WorkingIndicator colors={colors} />
            ) : (
              <PrimaryButton colors={colors}
                label="Resumir con otro modelo"
                onPress={() => {
                  if (menuChapter) {
                    void openModelPicker(menuChapter);
                  }
                }}
              />
            )}
            <TouchableOpacity
              onPress={() => setMenuChapter(null)}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modelPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (addingKey) {
            setAddingKey(false);
            setKeyStatus('');
          } else {
            setModelPicker(null);
          }
        }}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModelPicker(null)}
        >
          <TouchableOpacity style={[styles.menu, styles.modelMenu]} activeOpacity={1}>
            <Text style={styles.menuTitle}>Resumir con otro modelo</Text>
            <Text style={styles.menuSubtitle}>
              Elige una clave guardada o añade una nueva. La clave elegida se
              usará también en los próximos capítulos.
            </Text>

            {addingKey ? (
              <>
                <ScrollView
                  style={styles.keyFormList}
                  contentContainerStyle={styles.keyFormContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.providerLabel}>Proveedor de IA</Text>
                  <View style={styles.providerChips}>
                    {providers.map((provider) => {
                      const selected = provider.id === newProviderId;

                      return (
                        <TouchableOpacity
                          key={provider.id}
                          style={[
                            styles.providerChip,
                            selected ? styles.providerChipSelected : null,
                          ]}
                          onPress={() => setNewProviderId(provider.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${provider.shortLabel}${
                            provider.preferred ? ', preferido' : ''
                          }`}
                        >
                          <Text
                            style={[
                              styles.providerChipText,
                              selected ? styles.providerChipTextSelected : null,
                            ]}
                          >
                            {provider.preferred ? '★ ' : ''}
                            {provider.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <ApiKeyField colors={colors}
                    value={newKey}
                    onChangeText={setNewKey}
                    onPaste={() => void pasteNewKey()}
                  />
                  <ApiKeyHelp colors={colors} provider={getProvider(newProviderId)} />
                  <Text style={styles.keyStatus}>{keyStatus}</Text>
                </ScrollView>
                <PrimaryButton colors={colors}
                  label="Guardar y resumir"
                  onPress={() => void regenerateWithNewKey()}
                />
                <TouchableOpacity
                  onPress={() => setAddingKey(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Ver claves guardadas</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ScrollView style={styles.modelList}>
                  {modelPicker?.saved.map((id) => {
                    const provider = getProvider(id);
                    const isActive = id === modelPicker.active;

                    return (
                      <TouchableOpacity
                        key={id}
                        style={styles.modelOption}
                        onPress={() => void regenerateWithSavedKey(id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text style={styles.modelOptionLabel}>
                          {provider.preferred ? '★ ' : ''}
                          {provider.label}
                          {isActive ? ' · Actual' : ''}
                        </Text>
                        <Text style={styles.modelOptionMeta}>{provider.model}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <PrimaryButton colors={colors}
                  label="Añadir una nueva clave"
                  onPress={() => {
                    setNewProviderId(modelPicker?.active ?? 'gemini');
                    setKeyStatus('');
                    setAddingKey(true);
                  }}
                />
              </>
            )}

            <TouchableOpacity
              onPress={() => setModelPicker(null)}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        >
          <TouchableOpacity
            style={[styles.menu, styles.settingsMenu]}
            activeOpacity={1}
          >
            <ScrollView
              style={styles.settingsScroll}
              contentContainerStyle={styles.settingsContent}
            >
              <Text style={styles.menuTitle}>Ajustes del resumen</Text>
              <Text style={styles.menuSubtitle}>
                Tema, voz y tipografía en un solo lugar.
              </Text>

              <Text style={styles.providerLabel}>Tema</Text>
              <View style={styles.providerChips}>
                {THEME_MODES.map((mode) => {
                  const selected = themeMode === mode;

                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.providerChip,
                        selected ? styles.providerChipSelected : null,
                      ]}
                      onPress={() => {
                        setThemeMode(mode);
                        void saveTheme(mode);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Tema ${THEME_META[mode].label}`}
                    >
                      <Text
                        style={[
                          styles.providerChipText,
                          selected ? styles.providerChipTextSelected : null,
                        ]}
                      >
                        {THEME_META[mode].icon} {THEME_META[mode].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.settingsDivider} />

              <Text style={styles.providerLabel}>Lectura en voz alta</Text>
              <TouchableOpacity
                style={[
                  styles.voiceToggle,
                  readAloud ? styles.voiceToggleOn : null,
                ]}
                onPress={toggleReadAloud}
                accessibilityRole="button"
                accessibilityState={{ checked: readAloud }}
                accessibilityLabel={
                  readAloud
                    ? 'Desactivar lectura en voz alta'
                    : 'Activar lectura en voz alta'
                }
              >
                <Text
                  style={[
                    styles.voiceToggleText,
                    readAloud ? styles.voiceToggleTextOn : null,
                  ]}
                >
                  {readAloud ? 'Activada' : 'Desactivada'}
                </Text>
              </TouchableOpacity>
              {renderVoiceSettingRow(
                'rate',
                'Velocidad',
                `${voiceSettings.rate.toFixed(1)}×`,
              )}
              {renderVoiceSettingRow(
                'pitch',
                'Tono',
                `${voiceSettings.pitch.toFixed(1)}×`,
              )}
              {renderVoiceSettingRow(
                'commaPauseMs',
                'Pausa coma (ms)',
                `${voiceSettings.commaPauseMs}`,
              )}
              {renderVoiceSettingRow(
                'periodPauseMs',
                'Pausa punto (ms)',
                `${voiceSettings.periodPauseMs}`,
              )}

              <View style={styles.settingsDivider} />

              <Text style={styles.providerLabel}>Fuente del resumen</Text>
              <View style={styles.providerChips}>
                {SUMMARY_FONT_IDS.map((id) => {
                  const selected = summaryStyle.font === id;

                  return (
                    <TouchableOpacity
                      key={id}
                      style={[
                        styles.providerChip,
                        selected ? styles.providerChipSelected : null,
                      ]}
                      onPress={() => selectSummaryFont(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.providerChipText,
                          selected ? styles.providerChipTextSelected : null,
                        ]}
                      >
                        {SUMMARY_FONTS[id].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.voiceSettingRow}>
                <Text style={styles.voiceSettingLabel}>Tamaño</Text>
                <View style={styles.voiceStepper}>
                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => updateSummaryFontSize(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Reducir tamaño del resumen"
                  >
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.voiceSettingValue}>
                    {summaryStyle.fontSize} px
                  </Text>
                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => updateSummaryFontSize(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Aumentar tamaño del resumen"
                  >
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fontPreview}>
                <Text style={[styles.fontPreviewText, summaryTextStyle]}>
                  La lectura es más cómoda cuando el texto se adapta a ti.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={resetAllSettings}
              accessibilityRole="button"
            >
              <Text style={styles.devLink}>Restablecer todos los ajustes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSettingsVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
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
    bookHeader: {
      alignSelf: 'stretch',
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
    coverBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      padding: metrics.spacing.lg,
      gap: metrics.spacing.md,
    },
    coverLarge: {
      width: '100%',
      maxWidth: scale(420),
      height: '70%',
    },
    coverHint: {
      color: '#FFFFFF',
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
    },
    bookInfo: {
      flex: 1,
      gap: metrics.spacing.xs,
    },
    bookTitle: {
      color: colors.primaryDark,
      fontSize: metrics.font.heading,
      fontWeight: '700',
    },
    bookAuthor: {
      color: colors.accent,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    chapterMeta: {
      color: colors.muted,
      fontSize: metrics.font.body,
    },
    chapter: {
      alignSelf: 'stretch',
      backgroundColor: colors.hint,
      borderRadius: metrics.radius.md,
      padding: metrics.spacing.md,
      gap: metrics.spacing.xs,
    },
    chapterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: metrics.spacing.xs,
    },
    chapterHeadingButton: {
      flex: 1,
    },
    speakButton: {
      width: scale(26),
      height: scale(26),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: scale(13),
      borderWidth: scale(1),
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    speakIcon: {
      color: colors.primary,
      fontSize: scale(11),
      textAlign: 'center',
    },
    draft: {
      opacity: 0.85,
    },
    draftHeading: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    chapterHeading: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    chapterBody: {
      gap: metrics.spacing.sm,
    },
    chapterText: {
      color: colors.text,
      fontSize: metrics.font.body,
      lineHeight: scale(20),
    },
    similar: {
      alignSelf: 'stretch',
      backgroundColor: colors.hint,
      borderRadius: metrics.radius.md,
      padding: metrics.spacing.md,
      gap: metrics.spacing.sm,
    },
    similarHeading: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
      textAlign: 'center',
    },
    similarItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: metrics.spacing.sm,
    },
    similarCover: {
      width: scale(56),
      height: scale(84),
      borderRadius: metrics.radius.sm,
      backgroundColor: colors.hint,
    },
    similarInfo: {
      flex: 1,
      gap: metrics.spacing.xs,
    },
    similarTitle: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    similarAuthor: {
      color: colors.accent,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    similarReason: {
      color: colors.muted,
      fontSize: metrics.font.body,
    },
    similarChapters: {
      color: colors.accent,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      padding: metrics.spacing.lg,
    },
    menu: {
      width: '100%',
      maxWidth: scale(340),
      alignItems: 'center',
      gap: metrics.spacing.md,
      backgroundColor: colors.surface,
      borderRadius: metrics.radius.lg,
      padding: metrics.spacing.lg,
    },
    menuTitle: {
      color: colors.primaryDark,
      fontSize: metrics.font.heading,
      fontWeight: '700',
      textAlign: 'center',
    },
    menuSubtitle: {
      color: colors.muted,
      fontSize: metrics.font.body,
      textAlign: 'center',
    },
    menuMeta: {
      color: colors.accent,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
    },
    modelMenu: {
      maxHeight: '92%',
    },
    settingsMenu: {
      maxHeight: '92%',
    },
    settingsScroll: {
      width: '100%',
      maxHeight: scale(560),
    },
    settingsContent: {
      alignItems: 'center',
      gap: metrics.spacing.sm,
    },
    settingsDivider: {
      width: '100%',
      height: scale(1),
      backgroundColor: colors.border,
      marginVertical: metrics.spacing.xs,
    },
    fontPreview: {
      width: '100%',
      borderWidth: scale(1),
      borderColor: colors.border,
      borderRadius: metrics.radius.sm,
      backgroundColor: colors.background,
      padding: metrics.spacing.sm,
    },
    fontPreviewText: {
      color: colors.text,
    },
    voiceToggle: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: metrics.spacing.sm,
      borderRadius: metrics.radius.sm,
      borderWidth: scale(1),
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    voiceToggleOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    voiceToggleText: {
      color: colors.muted,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    voiceToggleTextOn: {
      color: colors.surface,
    },
    voiceSettingRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: metrics.spacing.sm,
    },
    voiceSettingLabel: {
      color: colors.text,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    voiceStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: metrics.spacing.xs,
    },
    stepButton: {
      width: scale(30),
      height: scale(30),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: scale(15),
      borderWidth: scale(1),
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    stepText: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    voiceSettingValue: {
      minWidth: scale(64),
      color: colors.muted,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
    },
    modelList: {
      width: '100%',
      maxHeight: scale(240),
    },
    keyFormList: {
      width: '100%',
      maxHeight: scale(620),
    },
    keyFormContent: {
      alignItems: 'center',
      gap: metrics.spacing.sm,
    },
    modelOption: {
      width: '100%',
      alignItems: 'flex-start',
      borderWidth: scale(1),
      borderColor: colors.border,
      borderRadius: metrics.radius.sm,
      paddingHorizontal: metrics.spacing.sm,
      paddingVertical: metrics.spacing.xs,
      gap: scale(2),
    },
    modelOptionLabel: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    modelOptionMeta: {
      color: colors.muted,
      fontSize: metrics.font.body,
    },
    providerLabel: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '700',
      textAlign: 'center',
    },
    providerChips: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: metrics.spacing.xs,
    },
    providerChip: {
      borderWidth: scale(1),
      borderColor: colors.border,
      borderRadius: metrics.radius.pill,
      paddingHorizontal: metrics.spacing.sm,
      paddingVertical: metrics.spacing.xs,
    },
    providerChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    providerChipText: {
      color: colors.muted,
      fontSize: metrics.font.body,
      fontWeight: '600',
    },
    providerChipTextSelected: {
      color: colors.surface,
    },
    keyStatus: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
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
    devLink: {
      color: colors.muted,
      fontSize: metrics.font.body,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    cardHeader: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: scale(32),
    },
    settingsButton: {
      position: 'absolute',
      top: scale(12),
      right: metrics.spacing.sm,
      width: scale(40),
      height: scale(40),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: scale(20),
      borderWidth: scale(1),
      borderColor: colors.border,
      backgroundColor: colors.surface,
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.12,
      shadowRadius: metrics.radius.sm,
      shadowOffset: { width: 0, height: scale(2) },
      elevation: 3,
    },
    settingsButtonIcon: {
      color: colors.primary,
      fontSize: scale(20),
      lineHeight: scale(22),
      textAlign: 'center',
    },
  });
}
