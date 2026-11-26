import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import ApiKeyField from '../components/ApiKeyField';
import ApiKeyHelp from '../components/ApiKeyHelp';
import PrimaryButton from '../components/PrimaryButton';
import { getProvider, providers, type ProviderId } from '../data/providers';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';
import { loadApiKey, loadProviderId, saveApiKey } from '../services/apiKey';

type HomeScreenProps = {
  initialApiKey: string;
  onKeyReady: (apiKey: string) => void;
};

export default function HomeScreen({
  initialApiKey,
  onKeyReady,
}: HomeScreenProps) {
  const [providerId, setProviderId] = useState<ProviderId>('gemini');
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [savedProvider, savedKey] = await Promise.all([
          loadProviderId(),
          loadApiKey(),
        ]);

        if (!active) {
          return;
        }

        setProviderId(savedProvider);
        setApiKey(savedKey ?? initialApiKey);
      } catch {
        // Mantenemos el estado inicial si no se puede leer el almacenamiento.
      }
    })();

    return () => {
      active = false;
    };
  }, [initialApiKey]);

  const selectProvider = async (id: ProviderId) => {
    if (id === providerId) {
      return;
    }

    setProviderId(id);
    setStatus('');

    try {
      const savedKey = await loadApiKey(id);
      setApiKey(savedKey ?? '');
    } catch {
      setApiKey('');
    }
  };

  const activateKey = async (key: string) => {
    try {
      const savedKey = await saveApiKey(key, providerId);
      setApiKey(savedKey);
      setStatus('Clave lista para usar.');
      onKeyReady(savedKey);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'No se pudo guardar la clave.',
      );
    }
  };

  const handlePaste = async () => {
    try {
      const copiedKey = (await Clipboard.getStringAsync()).trim();

      if (!copiedKey) {
        setStatus('No hay una clave copiada en el portapapeles.');
        return;
      }

      await activateKey(copiedKey);
    } catch {
      setStatus('No se pudo leer el portapapeles. Usa HTTPS o localhost en web.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TU BIBLIOTECA INTELIGENTE</Text>
          <Text style={styles.title}>Libreve</Text>
          <Text style={styles.subtitle}>
            Resúmenes claros y recomendaciones basadas en lo que te gusta leer.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configura tu clave de IA</Text>
          <Text style={styles.cardDescription}>
            Elige un proveedor, consigue una clave y pégala para usar Libreve.
          </Text>

          <View style={styles.providerSection}>
            <Text style={styles.providerLabel}>Proveedor de IA</Text>
            <View style={styles.providers}>
              {providers.map((provider) => {
                const selected = provider.id === providerId;

                return (
                  <TouchableOpacity
                    key={provider.id}
                    style={[
                      styles.providerChip,
                      selected ? styles.providerChipSelected : null,
                    ]}
                    onPress={() => void selectProvider(provider.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.providerChipText,
                        selected ? styles.providerChipTextSelected : null,
                      ]}
                    >
                      {provider.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <ApiKeyHelp provider={getProvider(providerId)} />
          <ApiKeyField
            value={apiKey}
            onChangeText={setApiKey}
            onPaste={() => void handlePaste()}
          />
          <PrimaryButton
            label="Usar clave"
            onPress={() => void activateKey(apiKey)}
          />
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.note}>
            Cada clave se guarda solo en este dispositivo y se envía únicamente
            al proveedor que elijas.
          </Text>
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
    maxWidth: '100%',
    paddingHorizontal: '6%',
    paddingVertical: metrics.spacing.xl,
    gap: metrics.spacing.lg,
  },
  hero: {
    width: '100%',
    alignItems: 'center',
    gap: metrics.spacing.xs,
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
  subtitle: {
    color: colors.muted,
    fontSize: metrics.font.subtitle,
    lineHeight: scale(22),
    maxWidth: '92%',
    textAlign: 'center',
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
  cardTitle: {
    color: colors.text,
    fontSize: metrics.font.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardDescription: {
    color: colors.muted,
    fontSize: metrics.font.body,
    lineHeight: scale(20),
    textAlign: 'center',
  },
  providerSection: {
    width: '100%',
    alignItems: 'center',
    gap: metrics.spacing.xs,
  },
  providerLabel: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  providers: {
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
  status: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  note: {
    color: colors.muted,
    fontSize: metrics.font.body,
    textAlign: 'center',
  },
});
