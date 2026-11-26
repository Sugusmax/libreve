import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type ApiKeyFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  onPaste: () => void;
};

export default function ApiKeyField({
  value,
  onChangeText,
  onPaste,
}: ApiKeyFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Clave de IA</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="Pega aquí tu API key"
          placeholderTextColor={colors.muted}
          secureTextEntry={!isVisible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          accessibilityLabel="Clave de IA"
        />
        <TouchableOpacity
          onPress={onPaste}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Pegar clave del portapapeles"
        >
          <Text style={styles.actionText}>Pegar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIsVisible((current) => !current)}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? 'Ocultar clave' : 'Mostrar clave'}
        >
          <Text style={styles.actionText}>{isVisible ? 'Ocultar' : 'Ver'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: metrics.spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: scale(1),
    borderColor: colors.border,
    borderRadius: metrics.radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: metrics.spacing.sm,
    gap: metrics.spacing.xs,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: metrics.font.input,
    paddingVertical: metrics.spacing.md,
    textAlign: 'center',
  },
  action: {
    flexShrink: 0,
    paddingVertical: metrics.spacing.xs,
  },
  actionText: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
  },
});
