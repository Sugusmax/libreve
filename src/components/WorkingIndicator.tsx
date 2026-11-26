import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { metrics, scale } from '../theme/metrics';

export default function WorkingIndicator() {
  const dots = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]).current;

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

const styles = StyleSheet.create({
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
