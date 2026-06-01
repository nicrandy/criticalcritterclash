export type Rarity = 'rare' | 'unique' | 'legendary';

export interface Critter {
  id: string;
  name: string;
  rarity: Rarity;
  image: string;       // filename inside images/product_images/
  strength: number;    // 0–9
  health: number;      // 0–9
  stamina: number;     // 0–9
  description: string;
}

export const critters: Critter[] = [
  {
    id: 'legendary-jackalope',
    name: 'Ancient Jackalope',
    rarity: 'legendary',
    image: 'legendary-jackalope.png',
    strength: 9,
    health: 7,
    stamina: 6,
    description: 'Carved from the oldest oak in the forest. Its antlers channel raw battle energy that few critters can withstand.',
  },
  {
    id: 'unique-shadow-pack',
    name: 'Shadow Pack',
    rarity: 'unique',
    image: 'unique-shadow-pack.png',
    strength: 7,
    health: 8,
    stamina: 7,
    description: 'The purple jackalope leads a fearsome crew — fox, raccoon, bear, and squirrel united in shadow flame.',
  },
  {
    id: 'unique-crystal-squirrel',
    name: 'Crystal Squirrel',
    rarity: 'unique',
    image: 'unique-crystal-squirrel.png',
    strength: 4,
    health: 5,
    stamina: 9,
    description: 'Small but utterly relentless. Perched on amethyst crystals, its stamina is almost supernatural.',
  },
  {
    id: 'rare-fox',
    name: 'Frost Fox',
    rarity: 'rare',
    image: 'rare-fox.png',
    strength: 5,
    health: 6,
    stamina: 7,
    description: 'A lone blue fox wreathed in frost-light, wielding a crystal blade with quiet, deadly precision.',
  },
  {
    id: 'rare-frost-pack',
    name: 'Frost Pack',
    rarity: 'rare',
    image: 'rare-frost-pack.png',
    strength: 6,
    health: 7,
    stamina: 6,
    description: 'Five critters bound by icy blue energy — this pack strikes fast and fights as one.',
  },
  {
    id: 'rare-bear-pack',
    name: 'Bear Pack',
    rarity: 'rare',
    image: 'rare-bear-pack.png',
    strength: 7,
    health: 8,
    stamina: 5,
    description: 'The bear leads from the front — a dark, hulking force with raccoon and squirrel flanking in the shadows.',
  },
];

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
