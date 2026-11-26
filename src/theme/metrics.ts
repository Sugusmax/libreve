import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const reference = Math.min(width, height);
const factor = Math.min(Math.max(reference / 390, 0.85), 1.25);

export const scale = (size: number) => Math.round(size * factor);

export const metrics = {
  spacing: {
    xs: scale(6),
    sm: scale(10),
    md: scale(16),
    lg: scale(24),
    xl: scale(32),
  },
  radius: {
    sm: scale(10),
    md: scale(16),
    lg: scale(24),
    pill: scale(999),
  },
  font: {
    eyebrow: scale(11),
    title: scale(36),
    subtitle: scale(15),
    heading: scale(18),
    body: scale(14),
    input: scale(16),
    button: scale(16),
  },
} as const;
