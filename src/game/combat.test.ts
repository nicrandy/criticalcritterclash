import { describe, expect, it } from 'vitest';
import {
  aiAllocateDice, calcMaxHp, calcPassive, computeRound, diceCountForStage,
  generateAIForStage, rarityTierForStage, shuffle, stageBoostGenerated, stageBoostReal,
  type RoundInput,
} from './combat';
import { levelFromXp, xpForLevel } from '../supabaseClient';
import type { Fighter, Stats } from './types';

function fighter(stats: Stats, hp?: number): Fighter {
  const maxHp = calcMaxHp(stats.health);
  return { name: 'Test', rarity: 'rare', alignment: 'good', base: stats, final: stats, hp: hp ?? maxHp, maxHp };
}

function input(over: Partial<RoundInput> = {}): RoundInput {
  return {
    pAct: 'attack', pRoll: 3, aAct: 'attack', aRoll: 3,
    p: fighter({ strength: 5, health: 5, stamina: 0 }),   // 25 max HP, passive 0
    a: fighter({ strength: 5, health: 5, stamina: 0 }),
    pShield: 0, aShield: 0, bonusAttackRoll: 0, bonusPassive: 0,
    goesFirst: 'player',
    ...over,
  };
}

describe('stat math', () => {
  it('calcMaxHp = health × 4 + 5', () => {
    expect(calcMaxHp(0)).toBe(5);
    expect(calcMaxHp(5)).toBe(25);
    expect(calcMaxHp(9)).toBe(41);
  });

  it('calcPassive = floor(stamina / 3)', () => {
    expect(calcPassive(0)).toBe(0);
    expect(calcPassive(5)).toBe(1);
    expect(calcPassive(9)).toBe(3);
  });
});

describe('leveling curve', () => {
  it('matches the documented thresholds', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(4)).toBe(1);
    expect(levelFromXp(5)).toBe(2);
    expect(levelFromXp(20)).toBe(3);
    expect(levelFromXp(45)).toBe(4);
  });

  it('xpForLevel is the inverse of levelFromXp', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(levelFromXp(xpForLevel(lvl))).toBe(lvl);
      if (lvl > 1) expect(levelFromXp(xpForLevel(lvl) - 1)).toBe(lvl - 1);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...original];
    const result = shuffle(original);
    expect(original).toEqual(copy);
    expect([...result].sort((a, b) => a - b)).toEqual(copy);
  });
});

describe('AI generation', () => {
  it('aiAllocateDice feeds the biggest die to the lowest stat', () => {
    const out = aiAllocateDice({ strength: 0, health: 2, stamina: 4 }, [6, 1]);
    expect(out.strength).toBe(6);                       // lowest stat gets the 6
    expect(out.strength + out.health + out.stamina).toBe(0 + 2 + 4 + 7);
  });

  it('stage bands match the original behaviour', () => {
    expect(rarityTierForStage(1)).toBe('rare');
    expect(rarityTierForStage(3)).toBe('unique');
    expect(rarityTierForStage(5)).toBe('legendary');
    expect(diceCountForStage(2)).toBe(1);
    expect(diceCountForStage(4)).toBe(2);
    expect(diceCountForStage(9)).toBe(3);
  });

  it('generateAIForStage(1) stays in the stage-1 envelope', () => {
    for (let i = 0; i < 50; i++) {
      const { base, final, rarity } = generateAIForStage(1);
      expect(rarity).toBe('rare');
      for (const k of ['strength', 'health', 'stamina'] as const) {
        expect(base[k]).toBeGreaterThanOrEqual(0);
        expect(base[k]).toBeLessThanOrEqual(3);
        expect(final[k]).toBeGreaterThanOrEqual(base[k]);
      }
    }
  });

  it('stage boost follows the ~2.7-total-per-stage curve', () => {
    expect(stageBoostGenerated(1)).toBe(0);
    expect(stageBoostGenerated(10)).toBe(8);
    expect(stageBoostGenerated(30)).toBe(26);    // ≈90 total at stage 30
    expect(stageBoostReal(1)).toBe(0);
    expect(stageBoostReal(30)).toBe(23);
  });

  it('stage-30 generated AI totals land near 90', () => {
    for (let i = 0; i < 50; i++) {
      const { final } = generateAIForStage(30);
      const total = final.strength + final.health + final.stamina;
      // base 26-29 per stat (78-87 total) + 3 dice (3-18)
      expect(total).toBeGreaterThanOrEqual(81);
      expect(total).toBeLessThanOrEqual(105);
    }
  });
});

describe('computeRound — attacks', () => {
  it('basic attack: damage = roll + STR − passive', () => {
    const r = computeRound(input({ aAct: 'heal', a: fighter({ strength: 5, health: 5, stamina: 6 }) }));
    // raw 3+5=8, passive floor(6/3)=2 → 6 dmg
    expect(r.pDmg).toBe(6);
    expect(r.aHpAfterPlayerAct).toBe(25 - 6);   // before the AI's own heal
  });

  it('a roll of 6 crits for +3', () => {
    const r = computeRound(input({ pRoll: 6, aAct: 'heal' }));
    expect(r.pCrit).toBe(true);
    expect(r.pDmg).toBe(6 + 5 + 3);
  });

  it('shield absorbs before HP and bypasses passive', () => {
    const r = computeRound(input({ aShield: 4, aAct: 'heal' }));
    // raw 8 vs shield 4 → 4 absorbed, 4 through
    expect(r.aShieldAbsorb).toBe(4);
    expect(r.pDmg).toBe(4);
    expect(r.aShieldFinal).toBe(0);
  });

  it('a big enough shield absorbs the whole hit', () => {
    const r = computeRound(input({ aShield: 10, aAct: 'heal' }));
    expect(r.aShieldAbsorb).toBe(8);
    expect(r.pDmg).toBe(0);
    expect(r.aShieldFinal).toBe(2);
  });

  it('HP never drops below 0 or rises above max', () => {
    const r = computeRound(input({ p: fighter({ strength: 99, health: 5, stamina: 0 }), aAct: 'heal' }));
    expect(r.aHpFinal).toBe(0);
    const h = computeRound(input({ pAct: 'heal', pRoll: 6, aAct: 'heal' }));
    expect(h.pHpFinal).toBe(25);   // already at max, heal clamps
  });
});

describe('computeRound — defend', () => {
  it('player defend: shield gain = roll + DEF, spent before HP on the AI hit', () => {
    const p = fighter({ strength: 5, health: 5, stamina: 4 });
    const r = computeRound(input({ pAct: 'defend', pRoll: 2, p, pShield: 4, goesFirst: 'ai' }));
    expect(r.pShieldGain).toBe(2 + 4);
    // AI raw 8 vs shield 4+6=10 → all absorbed
    expect(r.pShieldAbsorb).toBe(8);
    expect(r.aDmg).toBe(0);
    expect(r.pShieldFinal).toBe(2);
  });

  it('AI defend: DEF grows by the roll and the shield restores to it', () => {
    const a = fighter({ strength: 5, health: 5, stamina: 3 });
    const r = computeRound(input({ aAct: 'defend', aRoll: 4, a, aShield: 0 }));
    expect(r.aNewStamina).toBe(7);
    // player raw 8 vs restored shield 7 → 7 absorbed, 1 through
    expect(r.aShieldAbsorb).toBe(7);
    expect(r.pDmg).toBe(1);
  });
});

describe('computeRound — turn order (the heal-ordering fix)', () => {
  it('a killing blow from the first actor cancels the second action entirely', () => {
    const a = fighter({ strength: 5, health: 5, stamina: 0 }, 5);   // 5 HP left
    const r = computeRound(input({ a, goesFirst: 'player' }));
    expect(r.aiDefeated).toBe(true);
    expect(r.aiActed).toBe(false);
    expect(r.aDmg).toBe(0);                  // the AI never swung
    expect(r.pHpFinal).toBe(25);             // player untouched
    expect(r.aHpFinal).toBe(0);
  });

  it('AI going first denies a heal that would have saved the player', () => {
    const p = fighter({ strength: 5, health: 5, stamina: 0 }, 5);   // 5 HP left
    const r = computeRound(input({ p, pAct: 'heal', pRoll: 4, goesFirst: 'ai' }));
    // AI raw 8 ≥ 5 HP → player dies before the heal resolves
    expect(r.playerDefeated).toBe(true);
    expect(r.playerActed).toBe(false);
    expect(r.pHeal).toBe(0);
    expect(r.pHpFinal).toBe(0);
  });

  it('the same heal lands when the player goes first', () => {
    const p = fighter({ strength: 5, health: 5, stamina: 0 }, 5);
    const r = computeRound(input({ p, pAct: 'heal', pRoll: 4, goesFirst: 'player' }));
    // heal floor(25 × 0.7)=17 → 22 HP, then AI hits for 8 → 14
    expect(r.pHeal).toBe(17);
    expect(r.pHpAfterPlayerAct).toBe(22);
    expect(r.pHpFinal).toBe(14);
    expect(r.playerDefeated).toBe(false);
  });

  it('second actor still acts when surviving the first hit', () => {
    const r = computeRound(input({ goesFirst: 'ai' }));
    expect(r.playerActed).toBe(true);
    expect(r.aiActed).toBe(true);
    expect(r.pHpFinal).toBe(25 - 8);
    expect(r.aHpFinal).toBe(25 - 8);
  });
});
