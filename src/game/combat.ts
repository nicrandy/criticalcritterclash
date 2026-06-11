import { ALL_PERKS, STAT_DIST } from './battleData';
import type { Action, Fighter, PerkDef, Rarity, StatKey, Stats } from './types';

// ─── Dice / random helpers ────────────────────────────────────────────────────
export const randInt = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
export const rollD6  = () => randInt(1, 6);
export const pick    = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

/** Unbiased Fisher–Yates shuffle (returns a new array) */
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let _uid = 0;
export const uid = () => ++_uid;

// ─── Stat math ────────────────────────────────────────────────────────────────
export const calcMaxHp   = (health: number) => health * 4 + 5;
export const calcPassive = (stamina: number) => Math.floor(stamina / 3);

export function rollStatForRarity(r: Rarity): number {
  const dist = STAT_DIST[r];
  const total = dist.reduce((s, [, w]) => s + w, 0);
  let v = Math.random() * total;
  for (const [val, w] of dist) { v -= w; if (v <= 0) return val; }
  return dist[dist.length - 1][0];
}

export function aiAllocateDice(base: Stats, dice: number[]): Stats {
  const r = { ...base };
  [...dice].sort((a, b) => b - a).forEach(d => {
    const k = (['strength','health','stamina'] as StatKey[]).reduce((a, b) => r[a] < r[b] ? a : b);
    r[k] += d;
  });
  return r;
}

// Stage-based AI: base grows 2 pts/stage, 3-pt spread, dice added on top.
// No 9-cap — AI stats can exceed 9 at high stages (stage 5 → 8-12, stage 9 → 16-19+).
export function generateAIForStage(stage: number): { base: Stats; final: Stats; rarity: Rarity } {
  const base_min = Math.max(0, (stage - 1) * 2);
  const base_max = base_min + 3;
  const base: Stats = {
    strength: randInt(base_min, base_max),
    health:   randInt(base_min, base_max),
    stamina:  randInt(base_min, base_max),
  };
  const dice = Array.from({ length: diceCountForStage(stage) }, rollD6);
  const final = aiAllocateDice(base, dice);
  return { base, final, rarity: rarityTierForStage(stage) };
}

// Dice: stages 1-2 → 1 die, 3-4 → 2 dice, 5+ → 3 dice
export const diceCountForStage  = (stage: number) => stage <= 2 ? 1 : stage <= 4 ? 2 : 3;
// Rarity tier bands: Rare → stages 1-2, Unique → 3-4, Legendary → 5+
export const rarityTierForStage = (stage: number): Rarity => stage <= 2 ? 'rare' : stage <= 4 ? 'unique' : 'legendary';

/** Two random perk offers for a stage win; variable-strength perks roll their value here */
export function rollPerkChoices(): PerkDef[] {
  return shuffle(ALL_PERKS).slice(0, 2).map(p => {
    switch (p.id) {
      case 'sharpened': {
        const v = randInt(1, 3);
        return { ...p, value: v, desc: `+${v} Strength permanently` };
      }
      case 'vitality': {
        const v = randInt(2, 4);
        return { ...p, value: v, desc: `+${v} Health stat (+${v * 4} max HP)` };
      }
      case 'fortified': {
        const v = randInt(2, 4);
        return { ...p, value: v, desc: `+${v} Defense — bigger shield every stage` };
      }
      default: return p;
    }
  });
}

export function pickAIAction(ai: Fighter, _p: Fighter, last: Action | null, healCount: number, hasDefended: boolean): Action {
  const canHeal    = healCount < 1;   // AI gets exactly one heal
  const canDefend  = !hasDefended;    // AI gets exactly one defend
  if (!canHeal && !canDefend) return 'attack';
  if (!canHeal) return last === 'attack' && canDefend && Math.random() < 0.4 ? 'defend' : 'attack';
  if (!canDefend) {
    if (ai.hp / ai.maxHp < 0.3 && Math.random() < 0.65) return 'heal';
    const r = Math.random(); return r < 0.65 ? 'attack' : 'heal';
  }
  if (ai.hp / ai.maxHp < 0.3 && Math.random() < 0.65) return 'heal';
  if (last === 'attack' && Math.random() < 0.4) return 'defend';
  const r = Math.random();
  return r < 0.55 ? 'attack' : r < 0.75 ? 'defend' : 'heal';
}

// ─── Round resolution ─────────────────────────────────────────────────────────
// Pure: all randomness (action choices, rolls, turn order) is in the input, so
// the same input always produces the same result. This is what the tests cover.

export interface RoundInput {
  pAct: Action; pRoll: number;
  aAct: Action; aRoll: number;
  p: Fighter; a: Fighter;
  pShield: number; aShield: number;
  bonusAttackRoll: number; bonusPassive: number;
  goesFirst: 'player' | 'ai';
}

export interface RoundResult {
  // Shields (defend takes effect at announcement, before either attack)
  aNewStamina: number;          // AI DEF stat after a defend roll
  pShieldGain: number;
  pShieldFinal: number; aShieldFinal: number;
  pShieldAbsorb: number; aShieldAbsorb: number;
  // Attacks & heals (zero for an actor that never got to act)
  pDmg: number; aDmg: number; pCrit: boolean; aCrit: boolean;
  pHeal: number; aHeal: number;
  pass_p: number; pass_a: number;
  // Whether each side's action actually resolved — the second actor's action
  // is cancelled when the first actor lands a killing blow.
  playerActed: boolean; aiActed: boolean;
  // HP snapshots in turn order, for the mid-round animation
  pHpAfterPlayerAct: number; aHpAfterPlayerAct: number;
  pHpAfterAiAct: number;     aHpAfterAiAct: number;
  pHpFinal: number; aHpFinal: number;
  playerDefeated: boolean; aiDefeated: boolean;
}

export function computeRound(input: RoundInput): RoundResult {
  const { pAct, pRoll, aAct, aRoll, p, a, pShield, aShield, bonusAttackRoll, bonusPassive, goesFirst } = input;

  // ── Shields — defend takes effect at announcement, before either attack ───
  const aNewStamina = aAct === 'defend' ? a.final.stamina + aRoll : a.final.stamina;
  const pShieldGain = pAct === 'defend' ? pRoll + p.final.stamina : 0;
  let pShieldRun = pShield + pShieldGain;
  // AI defend: shield goes TO the new stamina value (full restore), not additive
  let aShieldRun = aAct === 'defend' ? aNewStamina : aShield;

  const pass_p = calcPassive(p.final.stamina) + bonusPassive;
  const pass_a = calcPassive(a.final.stamina);

  // Heal = 30% base + 10% per pip; roll 4 → 70% of max HP
  const pHeal = pAct === 'heal' ? Math.floor(p.maxHp * (0.30 + 0.10 * pRoll)) : 0;
  const aHeal = aAct === 'heal' ? Math.floor(a.maxHp * (0.30 + 0.10 * aRoll)) : 0;

  // ── Actions, applied strictly in turn order ───────────────────────────────
  // The first actor's attack or heal lands before the second actor moves: a
  // killing blow from the first actor cancels the second action entirely (no
  // damage dealt, no shield consumed, no heal), so going first truly matters.
  const clampP = (v: number) => Math.min(p.maxHp, Math.max(0, v));
  const clampA = (v: number) => Math.min(a.maxHp, Math.max(0, v));

  let pHp = p.hp, aHp = a.hp;
  let pDmg = 0, pCrit = false, aShieldAbsorb = 0;
  let aDmg = 0, aCrit = false, pShieldAbsorb = 0;
  let playerActed = false, aiActed = false;
  let playerDefeated = false, aiDefeated = false;
  let pHpAfterPlayerAct = pHp, aHpAfterPlayerAct = aHp;
  let pHpAfterAiAct = pHp,     aHpAfterAiAct = aHp;

  const playerActs = () => {
    playerActed = true;
    if (pAct === 'attack') {
      pCrit = pRoll === 6;
      const raw = pRoll + p.final.strength + (pCrit ? 3 : 0) + bonusAttackRoll;
      if (aShieldRun > 0) {
        aShieldAbsorb = Math.min(aShieldRun, raw);
        aShieldRun    = aShieldRun - aShieldAbsorb;
        pDmg          = Math.max(0, raw - aShieldAbsorb);
      } else {
        pDmg = Math.max(0, raw - pass_a);
      }
    }
    aHp = clampA(aHp - pDmg);
    pHp = clampP(pHp + pHeal);
    pHpAfterPlayerAct = pHp; aHpAfterPlayerAct = aHp;
    aiDefeated = aHp <= 0;
  };

  const aiActs = () => {
    aiActed = true;
    if (aAct === 'attack') {
      aCrit = aRoll === 6;
      const raw = aRoll + a.final.strength + (aCrit ? 3 : 0);
      if (pShieldRun > 0) {
        pShieldAbsorb = Math.min(pShieldRun, raw);
        pShieldRun    = pShieldRun - pShieldAbsorb;
        aDmg          = Math.max(0, raw - pShieldAbsorb);
      } else {
        aDmg = Math.max(0, raw - pass_p);
      }
    }
    pHp = clampP(pHp - aDmg);
    aHp = clampA(aHp + aHeal);
    pHpAfterAiAct = pHp; aHpAfterAiAct = aHp;
    playerDefeated = pHp <= 0;
  };

  if (goesFirst === 'player') {
    playerActs();
    pHpAfterAiAct = pHp; aHpAfterAiAct = aHp;   // overwritten below if the AI acts
    if (!aiDefeated) aiActs();
  } else {
    aiActs();
    pHpAfterPlayerAct = pHp; aHpAfterPlayerAct = aHp;
    if (!playerDefeated) playerActs();
  }

  return {
    aNewStamina, pShieldGain,
    pShieldFinal: pShieldRun, aShieldFinal: aShieldRun,
    pShieldAbsorb, aShieldAbsorb,
    pDmg, aDmg, pCrit, aCrit,
    pHeal: playerActed ? pHeal : 0, aHeal: aiActed ? aHeal : 0,
    pass_p, pass_a,
    playerActed, aiActed,
    pHpAfterPlayerAct, aHpAfterPlayerAct,
    pHpAfterAiAct, aHpAfterAiAct,
    pHpFinal: pHp, aHpFinal: aHp,
    playerDefeated, aiDefeated,
  };
}
