import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import PrimaryButton from '../components/PrimaryButton';
import {
  interests,
  MAX_INTERESTS,
  MIN_INTERESTS,
} from '../data/interests';
import { saveInterests } from '../services/preferences';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type InterestsScreenProps = {
  initialInterests: string[];
  onComplete: (ids: string[]) => void;
};

export default function InterestsScreen({
  initialInterests,
  onComplete,
}: InterestsScreenProps) {
  const [selected, setSelected] = useState<string[]>(initialInterests);
  const [status, setStatus] = useState('');

  const toggleInterest = (id: string) => {
    setStatus('');

    if (selected.includes(id)) {
      setSelected(selected.filter((item) => item !== id));
      return;
    }

    if (selected.length >= MAX_INTERESTS) {
      setStatus(`Puedes elegir hasta ${MAX_INTERESTS} temas.`);
      return;
    }

    setSelected([...selected, id]);
  };

  const handleSave = async () => {
    if (selected.length < MIN_INTERESTS) {
      setStatus(`Elige al menos ${MIN_INTERESTS} temas.`);
      return;
    }

    try {
      await saveInterests(selected);
      onComplete(selected);
    } catch {
      setStatus('No se pudieron guardar tus intereses. Inténtalo de nuevo.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PERSONALIZA TUS LECTURAS</Text>
          <Text style={styles.title}>¿Qué te gusta leer?</Text>
          <Text style={styles.description}>
            Elige los temas que más te interesan para recibir mejores
            recomendaciones. Solo te lo preguntaremos una vez.
          </Text>

          <View style={styles.chips}>
            {interests.map((interest) => {
              const isSelected = selected.includes(interest.id);

              return (
                <TouchableOpacity
                  key={interest.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleInterest(interest.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.emoji}>{interest.emoji}</Text>
                  <Text
                    style={[
                      styles.chipLabel,
                      isSelected && styles.chipLabelSelected,
                    ]}
                  >
                    {interest.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.counter}>
            {selected.length} seleccionados · entre {MIN_INTERESTS} y{' '}
            {MAX_INTERESTS}
          </Text>
          <Text style={styles.status}>{status}</Text>
          <PrimaryButton
            label="Guardar intereses"
            onPress={() => void handleSave()}
            disabled={selected.length < MIN_INTERESTS}
          />
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: metrics.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: scale(1),
    borderColor: colors.border,
    borderRadius: metrics.radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: metrics.spacing.sm,
    paddingVertical: metrics.spacing.xs,
    gap: metrics.spacing.xs,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  emoji: {
    fontSize: metrics.font.body,
  },
  chipLabel: {
    color: colors.text,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipLabelSelected: {
    color: colors.surface,
  },
  counter: {
    color: colors.muted,
    fontSize: metrics.font.body,
    textAlign: 'center',
  },
  status: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});
