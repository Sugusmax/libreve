import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors as fallbackColors, type Palette } from '../theme/colors';
import { metrics } from '../theme/metrics';

type BackLinkProps = {
  label: string;
  onPress: () => void;
  colors?: Palette;
};

export default function BackLink({
  label,
  onPress,
  colors = fallbackColors,
}: BackLinkProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button">
      <Text style={styles.text}>← {label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    text: {
      color: colors.primary,
      fontSize: metrics.font.body,
      fontWeight: '600',
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
}
