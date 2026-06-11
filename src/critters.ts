// Rarity styling shared across the site. The critter roster itself lives in
// the Supabase `critters` table — there is deliberately no hardcoded copy
// here, so the database stays the single source of truth.
export type { Rarity } from './game/types';
import type { Rarity } from './game/types';

export const rarityColor: Record<Rarity, string> = {
  legendary: '#c9a84c',
  unique:    '#9333ea',
  rare:      '#2563eb',
};

export const rarityGlow: Record<Rarity, string> = {
  legendary: 'rgba(201,168,76,0.5)',
  unique:    'rgba(147,51,234,0.5)',
  rare:      'rgba(37,99,235,0.5)',
};
