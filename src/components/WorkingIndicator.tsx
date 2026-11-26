import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors as fallbackColors, type Palette } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

type WorkingIndicatorProps = {
  colors?: Palette;
};

export default function WorkingIndicator({
  colors = fallbackColors,
}: WorkingIndicatorProps) {
  const dots = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        160,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 520,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0.35,
              duration: 520,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );

    animation.start();

    return () => animation.stop();
  }, [dots]);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel="La app está trabajando"
    >
      <View style={styles.dots}>
        {dots.map((dot, index) => (
          <Animated.View key={index} style={[styles.dot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: metrics.spacing.sm,
      backgroundColor: colors.hint,
      borderRadius: metrics.radius.sm,
      paddingVertical: metrics.spacing.md,
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: scale(5),
    },
    dot: {
      width: scale(7),
      height: scale(7),
      borderRadius: scale(4),
      backgroundColor: colors.primary,
    },
  });
}
