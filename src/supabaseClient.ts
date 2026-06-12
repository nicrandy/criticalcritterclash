import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ijkrbptanpdifsfzihiy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MHv0-VTTbR4CSYzGbmC_yA_1lGBnuls';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Event {
  id: string;
  site: string;
  title: string;
  location: string;
  start_date: string;   // 'YYYY-MM-DD'
  end_date: string | null;
  description: string | null;
  url: string | null;
}

// ── Score reading ─────────────────────────────────────────────────────────────

export interface ScoreData {
  alignment: { good: number; evil: number };
  guilds: { guild: string; total_points: number }[];
}

export async function fetchScores(): Promise<ScoreData> {
  const [alignRes, guildRes] = await Promise.all([
    supabase.from('alignment_scores').select('alignment, total_points'),
    supabase.from('guild_scores').select('guild, total_points').order('total_points', { ascending: false }),
  ]);
  const rows = alignRes.data ?? [];
  const good = rows.find((r: { alignment: string; total_points: number }) => r.alignment === 'good')?.total_points ?? 0;
  const evil = rows.find((r: { alignment: string; total_points: number }) => r.alignment === 'evil')?.total_points ?? 0;
  return {
    alignment: { good, evil },
    guilds: (guildRes.data ?? []) as { guild: string; total_points: number }[],
  };
}

// ── Global score tracking ─────────────────────────────────────────────────────

/** Points awarded per victorious stage, keyed by starting rank */
const STAGE_POINTS: Record<string, number> = {
  rare:      3,  // Hard mode — highest reward
  unique:    2,  // Medium
  legendary: 1,  // Easy mode — lowest reward
};

/**
 * Called after each stage win. Atomically increments alignment and (if
 * playing with a real card) guild totals by the rank-based point value.
 * Fire-and-forget — failures are logged but never block the UI.
 */
export async function submitStageScore(
  alignment: 'good' | 'evil',
  rarity: 'rare' | 'unique' | 'legendary',
  guild?: string,
): Promise<void> {
  const pts = STAGE_POINTS[rarity] ?? 1;
  try {
    await supabase.rpc('add_alignment_points', { p_alignment: alignment, p_points: pts });
    if (guild) {
      await supabase.rpc('add_guild_points', { p_guild: guild, p_points: pts });
    }
  } catch (err) {
    console.warn('[scores] submitStageScore failed silently:', err);
  }
}

// ── Battle analytics tracking ──────────────────────────────────────────────────

export interface RoundSnap {
  r: number;
  first: 'player' | 'ai';
  p_act: string;  p_roll: number;
  ai_act: string; ai_roll: number;
  p_hp_start:  number; p_hp_end:  number;
  ai_hp_start: number; ai_hp_end: number;
  p_shield_start:  number; p_shield_end:  number;
  ai_shield_start: number; ai_shield_end: number;
  p_dmg: number; ai_dmg: number;
  p_crit: boolean; ai_crit: boolean;
}

export interface BattleRecord {
  stage: number; death_count: number; is_boss: boolean; boss_boost_stat: string | null;
  /** Scanned card ID of the player's critter; null for generated critters */
  p_critter_id: string | null;
  p_alignment: string; p_rarity: string; p_guild: string;
  p_str: number; p_hp_stat: number; p_def: number; p_max_hp: number;
  p_max_heals: number; p_bonus_atk: number; p_bonus_passive: number;
  ai_alignment: string; ai_rarity: string;
  ai_str: number; ai_hp_stat: number; ai_def: number; ai_max_hp: number;
  winner: 'player' | 'ai';
  total_rounds: number; final_p_hp: number; final_ai_hp: number;
  opponent_id: string | null;
  rounds: RoundSnap[];
}

/** Fire-and-forget: save one completed battle row to Supabase */
export async function recordBattle(rec: BattleRecord): Promise<void> {
  try {
    await supabase.from('battles').insert([rec]);
  } catch {
    // never crash the game
  }
}

// ─── Critter leveling ──────────────────────────────────────────────────────
// Mirrors the curve used by the `award_battle_xp` Supabase RPC:
//   level = floor(sqrt(xp / 5)) + 1
// so level 2 needs 5 xp, level 3 needs 20 xp, level 4 needs 45 xp, etc.
export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 5)) + 1;
}

/** XP required to *reach* the given level (inverse of levelFromXp) */
export function xpForLevel(level: number): number {
  return Math.pow(Math.max(1, level) - 1, 2) * 5;
}

// Level-up rewards live in the critters.stat_bonuses JSONB column — the
// strength/health/stamina columns are the printed card values and never
// change. Effective in-game stats = base + bonuses.
export interface StatBonuses {
  strength: number;
  health: number;
  stamina: number;
  history?: { level: number; stat: string; at: string }[];
}

export function bonusValue(b: StatBonuses | null | undefined, k: 'strength' | 'health' | 'stamina'): number {
  return b?.[k] ?? 0;
}

export interface AwardXpResult {
  new_xp: number | null;
  new_level: number | null;
  leveled_up: boolean | null;
  boosted_stat: 'strength' | 'health' | 'stamina' | null;
  strength: number | null;
  health: number | null;
  stamina: number | null;
}

/** Fire-and-forget: award XP for a stage win and apply any level-up stat bonus */
export async function awardBattleXp(critterId: string, stage: number, isBoss: boolean): Promise<AwardXpResult | null> {
  try {
    const { data, error } = await supabase.rpc('award_battle_xp', {
      p_critter_id: critterId,
      p_stage: stage,
      p_is_boss: isBoss,
    });
    if (error || !data?.[0]) return null;
    return data[0] as AwardXpResult;
  } catch {
    return null;
  }
}

// ─── Idle training ─────────────────────────────────────────────────────────
// Every 6 h of real time banks one server-simulated training battle (capped
// at 48 h). Claimed lazily when a card is scanned/viewed — see
// scripts/setup_idle_training.sql for the rules.

export interface IdleClaimResult {
  battles_fought: number;
  wins: number;
  xp_gained: number;
  new_xp: number;
  new_level: number;
  leveled_up: boolean;
  strength: number;
  health: number;
  stamina: number;
  log: { opponent: string; won: boolean }[];
}

/** Fire-and-forget-safe: returns null on any failure, never throws */
export async function claimIdleBattles(critterId: string): Promise<IdleClaimResult | null> {
  try {
    const { data, error } = await supabase.rpc('claim_idle_battles', { p_critter_id: critterId });
    if (error || !data?.[0]) return null;
    return data[0] as IdleClaimResult;
  } catch {
    return null;
  }
}

/** Format start/end dates into a readable range, e.g. "May 23 – 25" or "September 7" */
export function formatEventDate(start: string, end: string | null): string {
  const startDt = new Date(start + 'T12:00:00');
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', opts);

  if (!end) return fmt(startDt, { month: 'long', day: 'numeric' });

  const endDt = new Date(end + 'T12:00:00');
  const sameMonth = startDt.getMonth() === endDt.getMonth();

  if (sameMonth) {
    return `${fmt(startDt, { month: 'long', day: 'numeric' })} – ${endDt.getDate()}`;
  }
  return `${fmt(startDt, { month: 'long', day: 'numeric' })} – ${fmt(endDt, { month: 'long', day: 'numeric' })}`;
}
