import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import BackLink from '../components/BackLink';
import PrimaryButton from '../components/PrimaryButton';
import { getInterestLabels } from '../data/interests';
import { fetchSuggestions, type BookSuggestion } from '../services/ai';
import { useAppTheme } from '../theme/AppTheme';
import { type Palette } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type RecommendationsScreenProps = {
  interests: string[];
  hasSuggestions: boolean;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onReset: () => void;
  onBackToKey: () => void;
  onOpenLibrary: () => void;
  onOpenSearch: () => void;
  onContinue: (books?: BookSuggestion[]) => void;
};

export default function RecommendationsScreen({
  interests,
  hasSuggestions,
  notificationsEnabled,
  onToggleNotifications,
  onReset,
  onBackToKey,
  onOpenLibrary,
  onOpenSearch,
  onContinue,
}: RecommendationsScreenProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const labels = getInterestLabels(interests);

  const handleContinue = async () => {
    if (isLoading) {
      return;
    }

    if (hasSuggestions) {
      onContinue();
      return;
    }

    setIsLoading(true);
    setStatus('');

    try {
      const books = await fetchSuggestions(interests, setStatus);
      onContinue(books);
    } catch (requestError) {
      setStatus(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron obtener sugerencias.',
      );
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>TU PERFIL</Text>
          <Text style={styles.description}>
            Tu IA te recomendará libros que coincidan con tus intereses
          </Text>

          <View style={styles.tags}>
            {labels.map((label) => (
              <View key={label} style={styles.tag}>
                <Text style={styles.tagText}>{label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.notificationRow}
            onPress={onToggleNotifications}
            accessibilityRole="switch"
            accessibilityState={{ checked: notificationsEnabled }}
            accessibilityLabel="Recomendaciones diarias"
          >
            <View style={styles.notificationCopy}>
              <Text style={styles.notificationTitle}>Recomendaciones diarias</Text>
              <Text style={styles.notificationStatus}>
                {notificationsEnabled
                  ? 'Activadas · 10 h tras cerrar, luego 1 por día'
                  : 'Desactivadas'}
              </Text>
            </View>
            <View
              style={[
                styles.switchTrack,
                notificationsEnabled ? styles.switchTrackOn : null,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  notificationsEnabled ? styles.switchThumbOn : null,
                ]}
              />
            </View>
          </TouchableOpacity>

          <Text style={styles.status}>{status}</Text>
          <PrimaryButton colors={colors}
            label={
              isLoading
                ? 'Buscando sugerencias…'
                : hasSuggestions
                  ? 'Ver mis sugerencias'
                  : 'Continuar'
            }
            onPress={() => void handleContinue()}
            disabled={isLoading}
          />
          <TouchableOpacity onPress={onReset} accessibilityRole="button">
            <Text style={styles.link}>Cambiar intereses</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSearch} accessibilityRole="button">
            <Text style={styles.link}>Buscar cualquier libro</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenLibrary} accessibilityRole="button">
            <Text style={styles.link}>Mi biblioteca</Text>
          </TouchableOpacity>
          <BackLink colors={colors} label="Cambiar clave" onPress={onBackToKey} />
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
      justifyContent: 'center',
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
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: metrics.spacing.xs,
    },
    tag: {
      borderRadius: metrics.radius.pill,
      backgroundColor: colors.hint,
      paddingHorizontal: metrics.spacing.sm,
      paddingVertical: metrics.spacing.xs,
    },
    tagText: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
    },
    notificationRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: metrics.spacing.sm,
      paddingHorizontal: metrics.spacing.sm,
      paddingVertical: metrics.spacing.xs,
      borderRadius: metrics.radius.sm,
      backgroundColor: colors.hint,
    },
    notificationCopy: {
      flexShrink: 1,
      gap: scale(2),
    },
    notificationTitle: {
      color: colors.primaryDark,
      fontSize: metrics.font.body,
      fontWeight: '700',
    },
    notificationStatus: {
      color: colors.muted,
      fontSize: scale(12),
      lineHeight: scale(16),
    },
    switchTrack: {
      width: scale(40),
      height: scale(23),
      borderRadius: scale(12),
      backgroundColor: colors.border,
      justifyContent: 'center',
      paddingHorizontal: scale(3),
    },
    switchTrackOn: {
      backgroundColor: colors.primary,
    },
    switchThumb: {
      width: scale(17),
      height: scale(17),
      borderRadius: scale(9),
      backgroundColor: colors.surface,
    },
    switchThumbOn: {
      alignSelf: 'flex-end',
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
  });
}
