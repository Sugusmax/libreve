import { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AiProvider } from '../data/providers';
import { colors as fallbackColors, type Palette } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type ApiKeyHelpProps = {
  provider: AiProvider;
  colors?: Palette;
};

export default function ApiKeyHelp({
  provider,
  colors = fallbackColors,
}: ApiKeyHelpProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Cómo conseguir tu clave en 3 pasos
      </Text>
      <View style={styles.steps}>
        {provider.steps.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => void Linking.openURL(provider.helpUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Abrir ${provider.label} para crear una clave`}
      >
        <Text style={styles.linkText}>{provider.linkLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      width: '100%',
      alignItems: 'center',
      gap: metrics.spacing.xs,
    },
    title: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '700',
      textAlign: 'center',
    },
    steps: {
      width: '100%',
      gap: metrics.spacing.xs,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: metrics.spacing.xs,
    },
    stepNumber: {
      width: scale(22),
      height: scale(22),
      borderRadius: scale(11),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    stepNumberText: {
      color: colors.surface,
      fontSize: metrics.font.eyebrow,
      fontWeight: '700',
    },
    stepText: {
      flex: 1,
      color: colors.muted,
      fontSize: metrics.font.body,
      lineHeight: scale(20),
    },
    linkButton: {
      borderWidth: scale(1),
      borderColor: colors.primary,
      borderRadius: metrics.radius.pill,
      paddingHorizontal: metrics.spacing.sm,
      paddingVertical: metrics.spacing.xs,
    },
    linkText: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
