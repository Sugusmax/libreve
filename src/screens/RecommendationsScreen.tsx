import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import BackLink from '../components/BackLink';
import PrimaryButton from '../components/PrimaryButton';
import { getInterestLabels } from '../data/interests';
import { fetchSuggestions, type BookSuggestion } from '../services/ai';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type RecommendationsScreenProps = {
  interests: string[];
  hasSuggestions: boolean;
  onReset: () => void;
  onBackToKey: () => void;
  onOpenLibrary: () => void;
  onContinue: (books?: BookSuggestion[]) => void;
};

export default function RecommendationsScreen({
  interests,
  hasSuggestions,
  onReset,
  onBackToKey,
  onOpenLibrary,
  onContinue,
}: RecommendationsScreenProps) {
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
      <StatusBar style="dark" />
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

          <Text style={styles.status}>{status}</Text>
          <PrimaryButton
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
          <TouchableOpacity onPress={onOpenLibrary} accessibilityRole="button">
            <Text style={styles.link}>Mi biblioteca</Text>
          </TouchableOpacity>
          <BackLink label="Cambiar clave" onPress={onBackToKey} />
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
