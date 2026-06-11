// ─── Shared battle-game types ─────────────────────────────────────────────────

export type Rarity     = 'rare' | 'unique' | 'legendary';
export type StatKey    = 'strength' | 'health' | 'stamina';
export type Alignment  = 'good' | 'evil';
export type Guild      = 'rabbit' | 'fox' | 'squirrel' | 'rogue';
export type Action     = 'attack' | 'defend' | 'heal';
export type AnimStep   = 'idle' | 'p-act' | 'a-hit' | 'a-act' | 'p-hit';

export interface Stats   { strength: number; health: number; stamina: number; }

export interface Fighter {
  name: string; rarity: Rarity; alignment: Alignment; guild?: Guild;
  base: Stats; final: Stats; hp: number; maxHp: number;
  bossBoostStat?: StatKey; img?: string; opponentId?: string | null;
}

export interface LogEntry {
  id: number;
  type: 'separator' | 'hit' | 'critical' | 'block' | 'heal' | 'info';
  who?: 'player' | 'ai';
  text: string;
}

export interface FloatDmg {
  val: number; color: string; side: 'player' | 'ai'; id: number;
  /** Overrides the numeric display, e.g. "🛡️ +5" for a defend */
  label?: string;
}

export interface PerkDef  { id: string; name: string; icon: string; desc: string; value?: number; }

export interface NamePart { word: string; bonus: Partial<Record<StatKey, number>>; bonusLabel: string; }
