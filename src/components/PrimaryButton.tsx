import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { metrics } from '../theme/metrics';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      activeOpacity={0.85}
    >
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: metrics.radius.sm,
    paddingVertical: metrics.spacing.md,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    color: colors.surface,
    fontSize: metrics.font.button,
    fontWeight: '700',
  },
});
