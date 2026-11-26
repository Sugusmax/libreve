import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { metrics } from '../theme/metrics';

type BackLinkProps = {
  label: string;
  onPress: () => void;
};

export default function BackLink({ label, onPress }: BackLinkProps) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button">
      <Text style={styles.text}>← {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.primary,
    fontSize: metrics.font.body,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
