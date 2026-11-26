export type Interest = {
  id: string;
  label: string;
  emoji: string;
};

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 10;

export const interests: Interest[] = [
  { id: 'fantasy', label: 'Fantasía', emoji: '🧙' },
  { id: 'sci-fi', label: 'Ciencia ficción', emoji: '🚀' },
  { id: 'mystery', label: 'Misterio', emoji: '🔎' },
  { id: 'thriller', label: 'Thriller', emoji: '⚡' },
  { id: 'romance', label: 'Romance', emoji: '💕' },
  { id: 'horror', label: 'Terror', emoji: '👻' },
  { id: 'adventure', label: 'Aventura', emoji: '🗺️' },
  { id: 'history', label: 'Historia', emoji: '🏛️' },
  { id: 'biography', label: 'Biografías', emoji: '📖' },
  { id: 'self-help', label: 'Autoayuda', emoji: '🌱' },
  { id: 'productivity', label: 'Productividad', emoji: '⏱️' },
  { id: 'business', label: 'Negocios', emoji: '💼' },
  { id: 'economics', label: 'Economía', emoji: '📊' },
  { id: 'technology', label: 'Tecnología', emoji: '💻' },
  { id: 'science', label: 'Ciencia', emoji: '🔬' },
  { id: 'philosophy', label: 'Filosofía', emoji: '🧠' },
  { id: 'psychology', label: 'Psicología', emoji: '🧩' },
  { id: 'art', label: 'Arte', emoji: '🎨' },
  { id: 'music', label: 'Música', emoji: '🎵' },
  { id: 'travel', label: 'Viajes', emoji: '✈️' },
  { id: 'cooking', label: 'Cocina', emoji: '🍳' },
  { id: 'sports', label: 'Deportes', emoji: '🏆' },
  { id: 'nature', label: 'Naturaleza', emoji: '🌿' },
  { id: 'poetry', label: 'Poesía', emoji: '✍️' },
];

export function getInterestLabels(ids: string[]): string[] {
  return ids
    .map((id) => interests.find((interest) => interest.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}
